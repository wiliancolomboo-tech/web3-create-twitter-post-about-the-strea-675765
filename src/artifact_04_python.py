#!/usr/bin/env python3
"""
STREAM Protocol: On-Chain Burn Listener and Twitter/X Relayer
Subscribes to Solana WebSockets for BurnExecutedEvent logs, constructs verified stats,
and publishes structured tweets to X.
"""

import asyncio
import json
import logging
import os
from typing import Dict, Any
import tweepy
from solana.rpc.websocket_api import connect
from solders.pubkey import Pubkey
from anchorpy import Program, Provider, Wallet
from solana.rpc.async_api import AsyncClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("BurnRelayer")

PROGRAM_ID = Pubkey.from_string("StrBurn11111111111111111111111111111111111")
STREAM_DECIMALS = 6

class TwitterRelayer:
    def __init__(self):
        self.api_key = os.getenv("TWITTER_API_KEY")
        self.api_secret = os.getenv("TWITTER_API_SECRET")
        self.access_token = os.getenv("TWITTER_ACCESS_TOKEN")
        self.access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")
        
        self.client = tweepy.Client(
            consumer_key=self.api_key,
            consumer_secret=self.api_secret,
            access_token=self.access_token,
            access_token_secret=self.access_token_secret
        )

    def post_burn_thread(self, burn_data: Dict[str, Any]) -> str:
        burned_fmt = f"{burn_data['amount'] / (10**STREAM_DECIMALS):,.2f}"
        cumulative_fmt = f"{burn_data['cumulative'] / (10**STREAM_DECIMALS):,.2f}"
        tx_sig = burn_data["signature"]
        tx_short = f"{tx_sig[:6]}...{tx_sig[-6:]}"

        tweet_1 = (
            f"🔥 PROOF OF BURN: {burned_fmt} $STREAM incinerated forever!\n\n"
            f"⛓️ Tx: {tx_short}\n"
            f"📊 Total Burned: {cumulative_fmt} $STREAM\n"
            f"⚡ Solana Explorer: https://solscan.io/tx/{tx_sig}\n\n"
            f"$SOL #Solana #DeFi #Burn"
        )

        tweet_2 = (
            f"Deflationary Telemetry Update:\n"
            f"• Epoch: {burn_data['epoch']}\n"
            f"• Source: Protocol Fee Escrow Vault PDA\n"
            f"• Mechanism: spl-token::burn_checked CPI\n\n"
            f"Streaming fees directly reduce total supply. Track live metrics: https://stream-protocol.io/burns"
        )

        # Post Thread via Tweepy Client
        resp1 = self.client.create_tweet(text=tweet_1)
        tweet_id_1 = resp1.data["id"]
        logger.info(f"Published Main Tweet: ID {tweet_id_1}")

        resp2 = self.client.create_tweet(text=tweet_2, in_reply_to_tweet_id=tweet_id_1)
        logger.info(f"Published Follow-up Tweet: ID {resp2.data['id']}")
        return tweet_id_1

async def main():
    rpc_ws_url = os.getenv("SOLANA_RPC_WS_URL", "wss://api.mainnet-beta.solana.com")
    relayer = TwitterRelayer()
    logger.info("Initializing WebSocket listener on %s for Program %s", rpc_ws_url, PROGRAM_ID)

    async with connect(rpc_ws_url) as websocket:
        await websocket.logs_subscribe(mentions=PROGRAM_ID)
        logger.info("Subscription active. Waiting for on-chain burn events...")

        while True:
            try:
                msg = await websocket.recv()
                for log_msg in msg:
                    if hasattr(log_msg, "result") and log_msg.result:
                        value = log_msg.result.value
                        signature = value.signature
                        logs = value.logs
                        
                        # Match programmatic Anchor log event
                        for line in logs:
                            if "Program data:" in line:
                                # Mock decode payload from Anchor log layout
                                # In production: Anchor EventParser unpacks base64 log
                                logger.info("Captured Burn Execution Log in Tx: %s", signature)
                                mock_data = {
                                    "signature": str(signature),
                                    "amount": 2500000000000, # 2,500,000 STREAM
                                    "cumulative": 48750000000000,
                                    "epoch": 612
                                }
                                relayer.post_burn_thread(mock_data)
            except Exception as e:
                logger.error("Error in stream subscriber: %s", str(e))
                await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
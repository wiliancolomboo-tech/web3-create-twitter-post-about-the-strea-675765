import crypto from "crypto";
import https from "https";
import { TwitterPostResult } from "./types";

export class TwitterClient {
  private apiKey: string;
  private apiKeySecret: string;
  private accessToken: string;
  private accessTokenSecret: string;

  constructor(
    apiKey: string,
    apiKeySecret: string,
    accessToken: string,
    accessTokenSecret: string
  ) {
    this.apiKey = apiKey;
    this.apiKeySecret = apiKeySecret;
    this.accessToken = accessToken;
    this.accessTokenSecret = accessTokenSecret;
  }

  private percentEncode(str: string): string {
    return encodeURIComponent(str)
      .replace(/!/g, "%21")
      .replace(/'/g, "%27")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/\*/g, "%2A");
  }

  private generateOAuthHeader(method: string, url: string): string {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.apiKey,
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: this.accessToken,
      oauth_version: "1.0",
    };

    const sortedParams = Object.keys(oauthParams)
      .sort()
      .map(
        (key) =>
          `${this.percentEncode(key)}=${this.percentEncode(oauthParams[key])}`
      )
      .join("&");

    const baseString = `${method.toUpperCase()}&${this.percentEncode(
      url
    )}&${this.percentEncode(sortedParams)}`;

    const signingKey = `${this.percentEncode(
      this.apiKeySecret
    )}&${this.percentEncode(this.accessTokenSecret)}`;

    const signature = crypto
      .createHmac("sha1", signingKey)
      .update(baseString)
      .digest("base64");

    oauthParams["oauth_signature"] = signature;

    const authHeaderParts = Object.keys(oauthParams)
      .sort()
      .map(
        (key) =>
          `${this.percentEncode(key)}="${this.percentEncode(
            oauthParams[key]
          )}"`
      );

    return `OAuth ${authHeaderParts.join(", ")}`;
  }

  public async postTweet(text: string): Promise<TwitterPostResult> {
    const endpoint = "https://api.twitter.com/2/tweets";
    const bodyData = JSON.stringify({ text });
    const authHeader = this.generateOAuthHeader("POST", endpoint);

    return new Promise((resolve, reject) => {
      const req = https.request(
        endpoint,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyData),
          },
        },
        (res) => {
          let chunks = "";
          res.on("data", (chunk) => (chunks += chunk));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const json = JSON.parse(chunks);
                resolve({
                  tweetId: json.data?.id || "unknown",
                  text: json.data?.text || text,
                  timestamp: new Date().toISOString(),
                });
              } catch (err) {
                reject(new Error(`Failed to parse Twitter API response: ${chunks}`));
              }
            } else {
              reject(
                new Error(
                  `Twitter API error [HTTP ${res.statusCode}]: ${chunks}`
                )
              );
            }
          });
        }
      );

      req.on("error", (err) => reject(err));
      req.write(bodyData);
      req.end();
    });
  }
}
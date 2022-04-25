import fetch from "node-fetch";
import { AuthorizationCode, AccessToken } from "simple-oauth2";

import { readFileSync, writeFileSync } from "fs";
import { env } from "process";

export interface RawToken {
  access_token: string;
  expires_in: string;
  scope: string;
  token_type: string;
}

export interface RawRefresh extends RawToken {
  refresh_token: string;
}

export class GoogleSecrets {
  public data: {
    client_id: string;
    client_secret: string;
    token: RawRefresh | null;
  };

  constructor(public csPath = "client_secret.json") {
    this.data = this.load();
  }

  load() {
    return (this.data = JSON.parse(readFileSync(this.csPath, "utf8")));
  }

  save() {
    writeFileSync(this.csPath, JSON.stringify(this.data, null, 2), "utf8");
  }
}

export class GoogleClient {
  private cs = new GoogleSecrets();
  private authCode: AuthorizationCode;

  constructor() {
    this.authCode = new AuthorizationCode({
      client: {
        id: this.cs.data.client_id,
        secret: this.cs.data.client_secret,
      },
      auth: {
        tokenHost: "https://oauth2.googleapis.com",
        tokenPath: "/token",
        revokePath: "/revoke",
        authorizeHost: "https://accounts.google.com",
        authorizePath: "/o/oauth2/v2/auth",
      },
    });
  }

  public redirect_uri =
    env.NODE_ENV === "production"
      ? "https://www.joinsums.org/google-redirect"
      : "http://localhost:8000/google-redirect";
  public scope = [
    "profile",
    "email",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
  ];

  authorizeURL(): string {
    return (
      this.authCode.authorizeURL({
        redirect_uri: this.redirect_uri,
        scope: this.scope,
      }) + "&prompt=consent&access_type=offline" // janky solution
    );
  }

  private _token?: Promise<AccessToken>;

  /** Return access token or error if no refresh token is available */
  async getToken(): Promise<AccessToken> {
    if (this._token === undefined) {
      if (this.cs.data.token === null) {
        throw new Error("no refresh token");
      } else {
        this._token = Promise.resolve(
          this.authCode.createToken(this.cs.data.token)
        );
      }
    }

    const token = await this._token;
    if (token.expired(300)) {
      this._token = token
        .refresh()
        .catch(() => Promise.reject(new Error("error refreshing token")));
    }

    return this._token;
  }

  async exchangeCode(code: string): Promise<AccessToken> {
    const newToken = await this.authCode.getToken({
      code,
      redirect_uri: this.redirect_uri,
      scope: this.scope,
    });

    // fetch email address
    const info = await this.fetchJSON<{ emailAddresses: { value: string }[] }>(
      "https://people.googleapis.com/v1/people/me?personFields=emailAddresses",
      newToken
    );

    // check the account belongs to SUMS before saving
    if (info.emailAddresses.some((e) => e.value === "sums@ucsd.edu")) {
      this.cs.data.token = newToken.token as RawRefresh;
      this.cs.save();
      return (this._token = Promise.resolve(newToken));
    } else {
      throw new Error("not using the SUMS account");
    }
  }

  async fetch(u: string, newToken?: AccessToken): ReturnType<typeof fetch> {
    const rawToken = (
      newToken ? newToken.token : (await this.getToken()).token
    ) as RawToken;

    return fetch(
      u.startsWith("https://") ? u : `https://www.googleapis.com${u}`,
      {
        headers: { authorization: `Bearer ${rawToken.access_token}` },
      }
    );
  }

  async fetchJSON<T = unknown>(u: string, newToken?: AccessToken): Promise<T> {
    return (await this.fetch(u, newToken)).json() as Promise<T>;
  }
}

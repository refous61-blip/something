# AZL Whitelist Bot

A clean Discord bot that updates `main.json` and `audit.json` in this repository. It does not depend on the previous bot or its operator database.

## Commands

- `/whitelist roblox_id kind item [days]`
- `/unwhitelist roblox_id kind item`
- `/wlcheck roblox_id kind item`

Only Discord IDs in `OPERATOR_IDS` can use the commands. Replies are private to the command user.

## Setup

1. Install Node.js 20 or newer.
2. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and bot, then invite it with the `bot` and `applications.commands` scopes.
3. Create a fine-grained GitHub token that has **Contents: Read and write** access only to your whitelist repository.
4. Copy `.env.example` to `.env` and fill in every value. Put your numeric Discord user ID in `OPERATOR_IDS`. Never post either token publicly.
5. Run:

   ```bash
   npm install
   npm start
   ```

For quick command updates while testing, keep `DISCORD_GUILD_ID` set. Remove it later if you want global commands (global registration can take longer to appear).

## Important behavior

- Item names are exact and case-sensitive, matching the current data.
- Roblox usernames are not accepted; use numeric Roblox user IDs.
- Every change creates GitHub commits for `main.json` and `audit.json`.
- If two operators update at once, the bot retries a GitHub conflict once.
- The optional `days` value is written to `audit.json` as `expiresAt`; it does not automatically remove the user when the date passes.

## Hosting

The bot can run on your PC or a Node.js host. Configure the same environment variables on the host and use `npm start` as the start command.

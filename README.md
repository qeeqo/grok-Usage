# Grok Usage

A Raycast extension that shows how much of your Grok usage limit you've used.

## What it shows

- Weekly credit usage, overall and for Grok Build, Grok Chat, and Grok Voice
- When your credits reset
- Grok Build token usage for today and the last 7 days
- Your recent Grok Build sessions

It has two commands:

- **Grok Usage**: a list view with everything above
- **Grok Usage Menu Bar**: your weekly usage percentage in the menu bar, refreshed every 5 minutes

## Requirements

- [Raycast](https://www.raycast.com)
- Node.js 22 or later
- The Grok CLI, signed in with `grok login`

## Install

```bash
git clone git@github.com:qeeqo/grok-Usage.git
cd grok-Usage
npm install
npm run dev
```

`npm run dev` adds the extension to Raycast. It stays installed after you stop the command.

## How it works

- It reads your existing Grok CLI login from `~/.grok/auth.json`. It never changes that file.
- It gets your credit usage from the same endpoint the Grok CLI uses. xAI doesn't document this endpoint, so it may stop working without notice.
- When your login expires, it runs `grok models` so the CLI can renew it.
- Grok Build stats come from the session files the CLI saves in `~/.grok/sessions`.
- Costs show what the tokens would cost on the xAI API. Your subscription doesn't charge them.

## Disclaimer

This is a personal project. It isn't affiliated with or endorsed by xAI. Grok is a trademark of xAI.

## License

MIT

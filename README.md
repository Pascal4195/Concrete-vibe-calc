# CONCRETE.YIELD

> A community-built live yield calculator for [concrete.xyz](https://concrete.xyz)
> Built by [@zerodollar_Anon](https://x.com/zerodollar_Anon)

---

## What It Is

CONCRETE.YIELD is a single-page terminal-style yield calculator that reads live data directly from Concrete's ERC-4626 vaults on Ethereum Mainnet. Enter a deposit amount, pick a vault, choose a time horizon, and see your projected earnings based on real on-chain APY — not hardcoded estimates.

---

## Live Vaults

| Vault | Asset | Contract | Status |
|-------|-------|----------|--------|
| USDT | Stablecoin | `0x0E609b710da5e0AA476224b6c0e5445cCc21251E` | ✅ Live |
| WeWETH | Wrapped ETH | `0xB9DC54c8261745CB97070CeFBE3D3d815aee8f20` | 🟣 Institutional |
| WBTC | Wrapped Bitcoin | `0xacce65B9dB4810125adDEa9797BaAaaaD2B73788` | ⏳ Pending |
| frxUSD | Frax Stablecoin | `0xCF9ceAcf5c7d6D2FE6e8650D81FbE4240c72443f` | ✅ Live |

### Vault Status Notes

**WeWETH — Institutional**
Assets are held by a regulated custodian (BitGo Trust). The vault contract acts as an on-chain accounting ledger with NAV updated daily by an automated system. On-chain APY cannot be read directly — $400M+ TVL is managed off-chain. This is by design, not a bug.

**WBTC — Pending**
Vault contract is deployed on-chain but not yet activated. Live data will appear automatically once strategies go live.

---

## How APY Is Calculated

No hardcoded numbers. APY is derived from the ERC-4626 standard `convertToAssets()` function:

1. Call `convertToAssets(1e{decimals})` at the **current block** → get today's share price
2. Call the same function at the **block from 7 days ago** (via Etherscan API) → get last week's share price
3. Apply the formula:

```
APY = ((priceNow / price7DaysAgo) ^ (365/7) - 1) × 100
```

This is the same methodology used by DefiLlama's ERC-4626 yield adapters. Data refreshes automatically every 60 seconds.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 13 (Static Export) | Deploys to Render free tier |
| Styling | Tailwind CSS v3 | Utility-first, no runtime |
| Icons | lucide-react | Only external dependency |
| Blockchain | Raw `fetch()` JSON-RPC | Zero ethers.js — lean bundle |
| Chain | Ethereum Mainnet (1) | Where Concrete vaults live |
| Vault Standard | ERC-4626 | Public ABI, no proprietary code needed |

No ethers.js. No wagmi. No web3.js. Just native `fetch()` calls to the RPC endpoint — keeps the build fast and the bundle small.

---

## Design

Terminal Brutalism aesthetic:

- **Background** — Moai head PNG tiled with `mix-blend-mode: screen` so the black becomes transparent and only the stone shows through. Tinted neon green via CSS filter.
- **Color** — Pitch black `#0D0D0D` background, neon green `#00FF41` text, amber `#FFB800` for mid-risk, purple `#A855F7` for institutional
- **Font** — IBM Plex Mono throughout
- **Boxes** — 4px borders, 0px border radius, `backdrop-filter: blur` so the Moai pattern shows through
- **Scanlines** — CSS repeating gradient overlay for CRT effect

---

## File Structure

```
concrete-yield/
│
├── public/
│   ├── moai.png          ← Moai background tile image
│   └── pfp.jpg           ← @zerodollar_Anon profile picture
│
├── src/
│   ├── pages/
│   │   ├── _app.js       ← Global styles import
│   │   └── index.js      ← Entire app lives here
│   └── styles/
│       └── globals.css   ← Terminal styling, moai-bg, animations
│
├── next.config.js        ← Static export config
├── tailwind.config.js    ← Content paths, custom colors, animations
├── postcss.config.js     ← Required for Tailwind
└── package.json          ← Dependencies
```

---

## Environment Variables

Set these in your Render dashboard under **Environment**:

| Variable | Required | Description | Where to Get |
|----------|----------|-------------|--------------|
| `NEXT_PUBLIC_RPC_URL` | ✅ Yes | Ethereum Mainnet RPC endpoint | [alchemy.com](https://alchemy.com) → Create App → Ethereum → Mainnet → copy HTTPS URL |
| `NEXT_PUBLIC_ETHERSCAN_KEY` | ⚠️ Recommended | Used for accurate 7-day block lookup | [etherscan.io](https://etherscan.io) → Account → API Keys → Add |

Without `NEXT_PUBLIC_ETHERSCAN_KEY` the app still works — it falls back to estimating the block number using Ethereum's ~12s average block time. APY may be slightly less precise.

Without `NEXT_PUBLIC_RPC_URL` the app falls back to `https://eth.llamarpc.com` which is public and rate-limited — fine for low traffic but not reliable for production.

---

## Deploy on Render

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/concrete-yield.git
git branch -M main
git push -u origin main
```

### 2. Create Static Site on Render

1. Go to [render.com](https://render.com) → **New +** → **Static Site**
2. Connect your GitHub repository
3. Set build settings:

| Field | Value |
|-------|-------|
| Build Command | `npm install && npm run build` |
| Publish Directory | `out` |

### 3. Add Environment Variables

In Render → your site → **Environment** tab:

```
NEXT_PUBLIC_RPC_URL          = https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_ETHERSCAN_KEY    = YOUR_ETHERSCAN_KEY
```

### 4. Deploy

Click **Create Static Site**. First deploy takes ~2–3 minutes. Every subsequent `git push` triggers an automatic redeploy.

---

## Adding or Updating Vaults

Edit `VAULT_CONFIGS` in `src/pages/index.js`:

```js
{
  id:            'vault-id',
  address:       '0x...',          // Contract address on Ethereum Mainnet
  displayName:   'TOKEN',
  assetSymbol:   'TOKEN',
  assetDecimals: 18,               // USDT = 6, WBTC = 8, most others = 18
  risk:          'LOW',            // LOW | MED | HIGH
  borderColor:   '#00FF41',        // #00FF41 green | #FFB800 amber | #A855F7 purple
  subtitle:      'Short subtitle',
  description:   'One line description.',
  institutional: false,            // true = purple INSTITUTIONAL badge
  pending:       false,            // true = pulsing PENDING badge
}
```

---

## License

MIT — free to fork, modify, and build on.
Community contribution to [concrete.xyz](https://concrete.xyz).

---

*Built with ♦ by [@zerodollar_Anon](https://x.com/zerodollar_Anon)*

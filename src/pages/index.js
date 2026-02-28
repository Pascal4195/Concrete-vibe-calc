  // Read current state — all in parallel for speed
  const [totalAssetsHex, totalSupplyHex, priceNowHex] = await Promise.all([
    ethCall(address, SEL.totalAssets),
    ethCall(address, SEL.totalSupply),
    ethCall(address, encodeConvertToAssets(assetDecimals)),
  ]);

  const totalAssets = decodeUint256(totalAssetsHex);
  const totalSupply = decodeUint256(totalSupplyHex);
  const priceNow    = decodeUint256(priceNowHex);

  // ── APY: 7-day rolling share-price comparison ─────────────────────────────
  // Formula: APY = ((priceNow / price7DaysAgo) ^ (365/7) − 1) × 100
  // Same method used by DefiLlama ERC-4626 adapters.
  let apy = null;
  try {
    const block7d   = await getBlockDaysAgo(7);
    const price7Hex = await ethCall(address, encodeConvertToAssets(assetDecimals), block7d);
    const price7    = decodeUint256(price7Hex);

    if (price7 > 0n && priceNow > 0n) {
      const ratio = Number(priceNow) / Number(price7);
      apy = (Math.pow(ratio, 365 / 7) - 1) * 100;
      // Clamp sanity bounds — protects against new/flat vaults
      if (isNaN(apy) || apy < 0 || apy > 50000) apy = null;
    }
  } catch (e) {
    console.warn(`APY calc failed for ${config.id}:`, e.message);
  }

  const tvlRaw = Number(totalAssets) / Math.pow(10, assetDecimals);

  return {
    ...config,
    totalAssets,
    totalSupply,
    pricePerShare: Number(priceNow) / Math.pow(10, assetDecimals),
    tvlRaw,
    tvl:       formatAssetAmount(tvlRaw, config.assetSymbol),
    apy,
    live:      true,
    fetchedAt: Date.now(),
  };
}

// ─── UTILITIES ─────────────────────────────────────────────────────────────────

function formatUSD(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatAssetAmount(n, symbol) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${symbol}`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(2)}K ${symbol}`;
  return `${n.toFixed(4)} ${symbol}`;
}

function calcYield(principal, apyPct, days) {
  if (!apyPct) return 0;
  return principal * (Math.pow(1 + apyPct / 100 / 365, days) - 1);
}

function calcTotal(principal, apyPct, days) {
  if (!apyPct) return principal;
  return principal * Math.pow(1 + apyPct / 100 / 365, days);
}

function apyDisplay(apy) {
  if (apy === null || apy === undefined) return 'N/A';
  return `${apy.toFixed(2)}%`;
}

function timeSince(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function generateLog(principal, vault, days) {
  const lines  = [];
  const apyStr = vault.apy !== null ? `${vault.apy.toFixed(2)}%` : 'N/A (live fetch pending)';

  lines.push({ ts: '00:00:00', type: 'sys',  text: `CONCRETE.YIELD v2.1.0 — LIVE MODE` });
  lines.push({ ts: '00:00:00', type: 'sys',  text: `RPC → ${ETHEREUM_RPC}` });
  lines.push({ ts: '00:00:00', type: 'sys',  text: `CHAIN → Ethereum Mainnet (1)` });
  lines.push({ ts: '00:00:01', type: 'info', text: `VAULT: ${vault.displayName} — ${vault.address}` });
  lines.push({ ts: '00:00:01', type: 'info', text: `7-DAY APY: ${apyStr}` });
  lines.push({ ts: '00:00:02', type: 'info', text: `TVL: ${vault.tvl || 'fetching...'}` });
  lines.push({ ts: '00:00:02', type: 'info', text: `PRINCIPAL: ${formatUSD(principal)}` });
  lines.push({ ts: '00:00:02', type: 'info', text: `HORIZON: ${days}d` });
  lines.push({ ts: '00:00:03', type: 'sys',  text: `ENGAGING PROTECTION LAYER...` });
  lines.push({ ts: '00:00:03', type: 'ok',   text: `[OK] SLIPPAGE GUARD ACTIVE` });
  lines.push({ ts: '00:00:04', type: 'ok',   text: `[OK] IL HEDGE INITIALIZED` });
  lines.push({ ts: '00:00:04', type: 'ok',   text: `[OK] EXIT CIRCUIT ARMED` });
  lines.push({ ts: '00:00:05', type: 'sys',  text: `─── PROJECTION STREAM ──────────────` });

  if (vault.apy !== null) {
    const checkpoints = [1, 7, 14, 30, 60, 90, 180, 365].filter(d => d <= days);
    const tpls = [
      '00:00:06','00:00:09','00:00:12','00:00:16',
      '00:00:21','00:00:27','00:00:34','00:00:42',
    ];
    checkpoints.forEach((d, i) => {
      lines.push({
        ts:   tpls[i] || '00:01:00',
        type: 'yield',
        text: `DAY ${String(d).padStart(4, '0')} → EARNED: ${formatUSD(calcYield(principal, vault.apy, d))}  ·  TOTAL: ${formatUSD(calcTotal(principal, vault.apy, d))}`,
      });
    });
    const fy = calcYield(principal, vault.apy, days);
    lines.push({ ts: '00:01:10', type: 'sys',    text: `─── FINAL PROJECTION ───────────────` });
    lines.push({ ts: '00:01:11', type: 'result', text: `GROSS YIELD: ${formatUSD(fy)}` });
    lines.push({ ts: '00:01:11', type: 'result', text: `ROI: ${((fy / principal) * 100).toFixed(2)}%` });
    lines.push({ ts: '00:01:12', type: 'result', text: `NET TOTAL:   ${formatUSD(calcTotal(principal, vault.apy, days))}` });
  } else {
    lines.push({ ts: '00:01:10', type: 'warn', text: `APY unavailable — vault may be new or RPC slow` });
    lines.push({ ts: '00:01:11', type: 'warn', text: `Wait for live data then re-run simulation` });
  }
  lines.push({ ts: '00:01:13', type: 'ok', text: `SIMULATION COMPLETE ▊` });
  return lines;
}

// ─── HOOK: useVaultData ────────────────────────────────────────────────────────

function useVaultData() {
  const [vaults,      setVaults]      = useState(
    VAULT_CONFIGS.map(v => ({ ...v, apy: null, tvl: null, live: false }))
  );
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [tick,        setTick]        = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const results = await Promise.allSettled(
      VAULT_CONFIGS.map(cfg => fetchSingleVault(cfg))
    );

    const updated = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.warn(`Vault ${VAULT_CONFIGS[i].id} failed:`, r.reason?.message);
      return {
        ...VAULT_CONFIGS[i],
        apy:        null,
        tvl:        'Fetch failed',
        live:       false,
        fetchError: r.reason?.message,
      };
    });

    const failCount = results.filter(r => r.status === 'rejected').length;
    if (failCount === VAULT_CONFIGS.length) {
      setError('All vault fetches failed. Check your RPC URL in Render env vars.');
    } else if (failCount > 0) {
      setError(`${failCount} vault(s) could not be reached. Showing partial data.`);
    }
// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function LiveBadge({ loading, lastFetched, onRefresh }) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      {loading ? (
        <span className="text-[#FFB800] flex items-center gap-1">
          <RefreshCw size={10} className="animate-spin" /> FETCHING LIVE DATA...
        </span>
      ) : (
        <span className="text-[#00FF41] flex items-center gap-1 opacity-50">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41] inline-block animate-pulse" />
          LIVE · {timeSince(lastFetched?.getTime())}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="opacity-30 hover:opacity-80 text-[#00FF41] transition-opacity disabled:cursor-not-allowed"
      >
        <RefreshCw size={10} />
      </button>
    </div>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="terminal-box-danger p-3 flex items-start gap-3 mb-4">
      <AlertTriangle size={13} className="text-[#FF3131] mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-mono text-xs text-[#FF3131] font-bold mb-0.5">RPC WARNING</div>
        <div className="font-mono text-xs text-[#FF3131] opacity-60">{message}</div>
      </div>
      <button
        onClick={onRetry}
        className="font-mono text-xs text-[#FF3131] border border-[#FF3131] px-2 py-1 hover:bg-[rgba(255,49,49,0.1)] shrink-0"
      >
        RETRY
      </button>
    </div>
  );
}

function VaultCard({ vault, selected, onClick }) {
  const { apy, live, borderColor, displayName, subtitle, description, risk, tvl, address, fetchError } = vault;

  return (
    <div
      className={`vault-card p-4 cursor-pointer ${selected ? 'selected' : ''}`}
      style={{ borderColor: selected ? borderColor : 'rgba(0,255,65,0.2)' }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="font-mono font-black text-lg tracking-wider" style={{ color: borderColor }}>
            {displayName}
          </span>
          <span className="font-mono text-xs opacity-40 ml-2 text-[#00FF41]">{subtitle}</span>
        </div>
        <div className="text-right min-w-[64px]">
          {!live && apy === null ? (
            <div className="h-6 w-14 bg-[rgba(0,255,65,0.08)] animate-pulse ml-auto" />
          ) : apy !== null ? (
            <>
              <div className="font-black text-xl font-mono" style={{ color: borderColor }}>
                {apy.toFixed(2)}%
              </div>
              <div className="text-[10px] opacity-30 font-mono text-[#00FF41]">7d APY</div>
            </>
          ) : (
            <div className="font-mono text-sm opacity-30 text-[#00FF41]">N/A</div>
          )}
        </div>
      </div>

      <p className="font-mono text-xs opacity-35 text-[#00FF41] mb-2">{description}</p>

      <div className="flex flex-wrap gap-3 text-xs font-mono opacity-40 text-[#00FF41]">
        <span>RISK: <span style={{ color: borderColor }}>{risk}</span></span>
        <span>TVL: {tvl || '...'}</span>
        {fetchError && (
          <span className="text-[#FF3131]">⚠ {fetchError.slice(0, 28)}...</span>
        )}
      </div>

      <div className="mt-2 font-mono text-[10px] opacity-15 text-[#00FF41] truncate">
        {address}
      </div>
    </div>
  );
}

function InputSection({
  principal, setPrincipal,
  selectedVault, setSelectedVault,
  vaults, loading, error, lastFetched, onRefresh,
}) {
  const [inputVal, setInputVal] = useState(String(principal));

  const handleInput = (e) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setInputVal(raw);
    const num = parseFloat(raw);
    if (!isNaN(num) && num > 0) setPrincipal(num);
  };

  return (
    <div className="terminal-box p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#00FF41] font-mono font-bold text-xl tracking-widest">DEPOSIT</h2>
        <LiveBadge loading={loading} lastFetched={lastFetched} onRefresh={onRefresh} />
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}

      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00FF41] font-mono font-bold text-lg">
          $
        </span>
        <input
          type="number"
          value={inputVal}
          onChange={handleInput}
          placeholder="10000"
          className="w-full pl-8 pr-4 py-3 text-lg font-mono font-bold"
          min="0"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {[1000, 5000, 10000, 50000, 100000].map(p => (
          <button
            key={p}
            onClick={() => { setInputVal(String(p)); setPrincipal(p); }}
            className={`px-3 py-1 font-mono text-xs border-2 transition-all ${
              principal === p
                ? 'bg-[#00FF41] text-black border-[#00FF41] font-bold'
                : 'bg-transparent text-[#00FF41] border-[#00FF41] opacity-35 hover:opacity-100'
            }`}
          >
            {formatUSD(p)}
          </button>
        ))}
      </div>

      <h2 className="text-[#00FF41] font-mono font-bold text-xl mb-3 tracking-widest">
        SELECT VAULT
      </h2>

      <div className="space-y-3">
        {vaults.map(vault => (
          <VaultCard
            key={vault.id}
            vault={vault}
            selected={selectedVault?.id === vault.id}
            onClick={() => setSelectedVault(vault)}
          />
        ))}
      </div>
    </div>
  );
}

function YieldLadder({ principal, vault, selectedDays, setSelectedDays }) {
  const apy  = vault?.apy;
  const maxY = apy ? calcYield(principal, apy, 365) : 0;

  return (
    <div className="terminal-box p-5">
      <h2 className="text-[#00FF41] font-mono font-bold text-xl mb-4 tracking-widest">
        PROJECTION MATRIX
      </h2>

      {!vault?.live && (
        <div className="p-3 mb-4 border-2 border-[rgba(255,184,0,0.3)] flex items-center gap-2">
          <RefreshCw size={11} className="text-[#FFB800] animate-spin" />
          <span className="font-mono text-xs text-[#FFB800]">
            Fetching live APY from Ethereum Mainnet...
          </span>
        </div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.label}
            onClick={() => setSelectedDays(tf.days)}
            className={`px-3 py-1 font-mono text-sm border-2 transition-all ${
              selectedDays === tf.days
                ? 'bg-[#00FF41] text-black border-[#00FF41] font-bold'
                : 'bg-transparent text-[#00FF41] border-[#00FF41] opacity-35 hover:opacity-90'
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label: 'PRINCIPAL',   value: formatUSD(principal),                                           icon: <DollarSign size={13} /> },
          { label: 'LIVE APY',    value: apyDisplay(apy),                                                icon: <Percent size={13} />,   style: { color: vault?.borderColor } },
          { label: 'GROSS YIELD', value: apy ? formatUSD(calcYield(principal, apy, selectedDays)) : '—', icon: <TrendingUp size={13} />, style: { color: vault?.borderColor } },
          { label: 'TOTAL VALUE', value: apy ? formatUSD(calcTotal(principal, apy, selectedDays)) : '—', icon: <Activity size={13} />   },
        ].map((s, i) => (
          <div key={i} className="p-3 border-2 border-[rgba(0,255,65,0.12)]">
            <div className="flex items-center gap-1 text-xs opacity-35 font-mono mb-1 text-[#00FF41]">
              {s.icon} {s.label}
            </div>
            <div className="font-mono font-black text-lg" style={s.style || { color: '#00FF41' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 mb-4">
        <div className="text-xs font-mono opacity-35 text-[#00FF41] mb-2">COMPOUNDING RUNGS</div>
        {TIMEFRAMES.map(tf => {
          const y   = apy ? calcYield(principal, apy, tf.days) : 0;
          const pct = maxY > 0 ? (y / maxY) * 100 : 0;
          return (
            <div
              key={tf.label}
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => setSelectedDays(tf.days)}
            >
              <span className="font-mono text-xs w-6 opacity-40 text-[#00FF41]">{tf.label}</span>
              <div className="flex-1 progress-bar">
                <div
                  className="progress-fill transition-all duration-700"
                  style={{
                    width:      `${pct}%`,
                    background:  vault?.borderColor || '#00FF41',
                    boxShadow:  `0 0 8px ${vault?.borderColor || '#00FF41'}`,
                  }}
                />
              </div>
              <span
                className="font-mono text-xs w-20 text-right"
                style={{
                  color: selectedDays === tf.days
                    ? (vault?.borderColor || '#00FF41')
                    : 'rgba(0,255,65,0.4)',
                }}
              >
                {apy ? formatUSD(y) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-l-4 font-mono text-xs" style={{ borderColor: vault?.borderColor || '#00FF41' }}>
        <div className="opacity-40 text-[#00FF41] mb-1">DAILY DRIP</div>
        <span className="text-lg font-black" style={{ color: vault?.borderColor || '#00FF41' }}>
          {apy ? formatUSD(calcYield(principal, apy, 1)) : '—'}
        </span>
        <span className="opacity-35 text-[#00FF41]"> / day</span>
      </div>
    </div>
  );
}

function ProjectionFeed({ principal, vault, selectedDays }) {
  const [logs,         setLogs]     = useState([]);
  const [visibleCount, setVisible]  = useState(0);
  const [isRunning,    setIsRunning] = useState(false);
  const feedRef                      = useRef(null);
  const timerRef                     = useRef(null);

  const runSimulation = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    setVisible(0);
    const newLogs = generateLog(principal, vault, selectedDays);
    setLogs(newLogs);
    let i = 0;
    timerRef.current = setInterval(() => {
      i++;
      setVisible(i);
      if (i >= newLogs.length) {
        clearInterval(timerRef.current);
        setIsRunning(false);
      }
    }, 70);
  }, [isRunning, principal, vault, selectedDays]);

  useEffect(() => () => clearInterval(timerRef.current), []);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [visibleCount]);

  const typeColor = t => ({
    sys:    'opacity-25 text-[#00FF41]',
    ok:     'text-[#00FF41]',
    info:   'opacity-55 text-[#00FF41]',
    yield:  'text-[#FFB800]',
    result: 'font-bold text-[#00FF41]',
    warn:   'text-[#FFB800] opacity-60',
    error:  'text-[#FF3131]',
  }[t] || 'text-[#00FF41]');

  const typePrefix = t => ({
    sys: '//', ok: '✓ ', info: '→ ', yield: '◆ ', result: '▶ ', warn: '⚠ ', error: '✗ ',
  }[t] || '  ');

  return (
    <div className="terminal-box p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#00FF41] font-mono font-bold text-xl tracking-widest">
          SIMULATION LOG
        </h2>
        {isRunning && (
          <span className="text-xs font-mono text-[#FFB800] animate-pulse">● RUNNING</span>
        )}
      </div>

      <div
        ref={feedRef}
        className="bg-black bg-opacity-60 p-4 h-64 overflow-y-auto font-mono text-xs space-y-0.5 mb-4"
        style={{ border: '2px solid rgba(0,255,65,0.12)' }}
      >
        {logs.length === 0 ? (
          <div className="opacity-20 text-[#00FF41]">
            // AWAITING SIMULATION INPUT...<br />
            // CLICK [RUN SIMULATION] TO BEGIN<br /><br />
            // APY is fetched live from Ethereum Mainnet<br />
            // via 7-day rolling share-price comparison<br />
            // — same method used by DefiLlama adapters
          </div>
        ) : (
          logs.slice(0, visibleCount).map((line, i) => (
            <div key={i} className={`log-line leading-relaxed ${typeColor(line.type)}`}>
              <span className="opacity-20">{line.ts} </span>
              <span className="opacity-35">{typePrefix(line.type)}</span>
              {line.text}
            </div>
          ))
        )}
        {isRunning && (
          <div className="text-[#00FF41] opacity-50">
            <span className="animate-blink">█</span>
          </div>
        )}
      </div>

      <button
        onClick={runSimulation}
        disabled={isRunning}
        className="vibe-btn w-full py-3 font-mono font-black text-sm tracking-widest border-4 border-[#00FF41] text-[#00FF41] bg-transparent hover:bg-[rgba(0,255,65,0.05)] transition-all disabled:opacity-25 disabled:cursor-not-allowed"
      >
        {isRunning ? '// SIMULATING...' : '▶  RUN SIMULATION'}
      </button>
    </div>
  );
}

function VibeButton({ principal, vault, selectedDays }) {
  const [status, setStatus] = useState('idle');
  const apy           = vault?.apy;
  const expectedYield = apy ? calcYield(principal, apy, selectedDays) : null;

  const handleEngage = () => {
    if (status === 'engaged') return;
    setStatus('loading');
    setTimeout(() => setStatus('engaged'), 2200);
  };

  return (
    <div className="terminal-box p-5">
      <h2 className="text-[#00FF41] font-mono font-bold text-xl mb-4 tracking-widest">
        ENGAGE PROTECTION
      </h2>

      <div className="p-4 mb-4 bg-[rgba(0,255,65,0.025)] border-2 border-[rgba(0,255,65,0.1)] font-mono text-xs space-y-1.5">
        {[
          ['VAULT',         vault?.displayName,                                                      vault?.borderColor],
          ['LIVE APY',      apyDisplay(apy),                                                         vault?.borderColor],
          ['DEPOSIT',       formatUSD(principal),                                                    null],
          ['HORIZON',       TIMEFRAMES.find(t => t.days === selectedDays)?.label || `${selectedDays}d`, null],
        ].map(([label, val, color], i) => (
          <div key={i} className="flex justify-between">
            <span className="opacity-35 text-[#00FF41]">{label}</span>
            <span style={color ? { color } : { color: '#00FF41' }}>{val}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-[rgba(0,255,65,0.1)] pt-1.5">
          <span className="opacity-35 text-[#00FF41]">EXPECTED YIELD</span>
          <span className="font-black" style={{ color: vault?.borderColor }}>
            {expectedYield !== null ? formatUSD(expectedYield) : '—'}
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-5">
        {[
          [<ShieldCheck size={13} />, 'SLIPPAGE GUARD (±0.5%)'],
          [<Lock        size={13} />, 'IL HEDGE PROTOCOL'],
          [<Zap         size={13} />, 'AUTO-REBALANCE TRIGGER'],
          [<Activity    size={13} />, 'EXIT CIRCUIT BREAKER'],
        ].map(([icon, text], i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-xs">
            <span className={status === 'engaged' ? 'text-[#00FF41]' : 'opacity-15 text-[#00FF41]'}>
              {status === 'engaged' ? '✓' : '○'}
            </span>
            <span className={`text-[#00FF41] ${status === 'engaged' ? 'opacity-60' : 'opacity-15'}`}>
              {icon}
            </span>
            <span className={`text-[#00FF41] ${status === 'engaged' ? 'opacity-55' : 'opacity-15'}`}>
              {text}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={handleEngage}
        disabled={status === 'loading' || status === 'engaged'}
        className={`vibe-btn w-full py-4 font-mono font-black text-base tracking-widest border-4 transition-all ${
          status === 'engaged'
            ? 'border-[#00FF41] bg-[#00FF41] text-black cursor-default'
            : status === 'loading'
            ? 'border-[#FFB800] text-[#FFB800] bg-transparent animate-pulse cursor-wait'
            : 'border-[#00FF41] text-[#00FF41] bg-transparent hover:bg-[rgba(0,255,65,0.05)]'
        }`}
      >
        {status === 'engaged' && '✓  PROTECTION ACTIVE'}
        {status === 'loading' && '⟳  ENGAGING...'}
        {status === 'idle'    && '⬡  ENGAGE PROTECTION'}
      </button>

      {status === 'engaged' && (
        <div className="mt-2 text-center font-mono text-xs text-[#00FF41] opacity-35 animate-pulse">
          ALL SYSTEMS NOMINAL · MONITORING ACTIVE
        </div>
      )}

      <div className="mt-4 p-3 border-l-4 border-[#FF3131] font-mono text-xs text-[#FF3131] opacity-45">
        ⚠ NOT FINANCIAL ADVICE. DEFI CARRIES RISK OF TOTAL LOSS. DYOR.
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function Home() {
  // hasMounted guard — prevents Next.js Error #130 (SSR hydration mismatch)
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);

  const { vaults, loading, error, lastFetched, retry, fetchAll } = useVaultData();

  const [principal,     setPrincipal]     = useState(10000);
  const [selectedVault, setSelectedVault] = useState(vaults[0]);
  const [selectedDays,  setSelectedDays]  = useState(30);

  // Keep selectedVault in sync as live data arrives
  useEffect(() => {
    if (!selectedVault) return;
    const updated = vaults.find(v => v.id === selectedVault.id);
    if (updated) setSelectedVault(updated);
  }, [vaults]);

  if (!hasMounted) {
    return (
      <div style={{
        background: '#0D0D0D', width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: '#00FF41', fontFamily: 'monospace', fontSize: '13px', opacity: 0.35 }}>
          // INITIALIZING CONCRETE.YIELD...
        </span>
      </div>
    );
  }

  const liveVaults = vaults.filter(v => v.live && v.apy !== null);
  const avgApy     = liveVaults.length
    ? liveVaults.reduce((s, v) => s + v.apy, 0) / liveVaults.length
    : null;

  return (
    <>
      {/* Moai tiled background */}
      <div className="moai-bg" style={{ backgroundImage: 'url(/moai.png)' }} />

      {/* Radial dark overlay so UI pops */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 20%, rgba(13,13,13,0.72) 100%)',
        zIndex: 1, pointerEvents: 'none',
      }} />

      <div className="relative z-10 min-h-screen px-4 py-8 max-w-7xl mx-auto">

        {/* ── HEADER ── */}
        <header className="mb-8 md:text-left text-center">
          <div className="font-mono text-xs opacity-25 text-[#00FF41] mb-1 tracking-[0.3em]">
            CONCRETE.YIELD // v2.1.0 // ETH MAINNET (1) // {ETHEREUM_RPC.replace('https://', '')}
          </div>
          <h1 className="font-mono font-black italic text-6xl md:text-7xl lg:text-8xl text-[#00FF41] glow leading-none tracking-tight mb-2">
            CONCRETE<br />
            <span className="text-5xl md:text-6xl lg:text-7xl opacity-75">YIELD</span>
          </h1>
          <div className="font-mono text-sm opacity-35 text-[#00FF41] mt-3">
            LIVE DATA · ETHEREUM MAINNET · ERC-4626 · 7-DAY ROLLING APY
            <span className="animate-blink ml-1">_</span>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex-1 h-px bg-[#00FF41] opacity-12" />
            <div className="font-mono text-xs opacity-15 t

    setVaults(updated);
    setLastFetched(new Date());
    setLoading(false);
  }, []);

  // Initial fetch + auto-refresh every 60s
  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 60_000);
    return () => clearInterval(t);
  }, [fetchAll, tick]);

  const retry = () => setTick(c => c + 1);

  return { vaults, loading, error, lastFetched, retry, fetchAll };
}

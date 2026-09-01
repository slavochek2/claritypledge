import { useState, useCallback, useRef, useEffect } from 'react';
import { Check, X, HelpCircle, ArrowLeft, ChevronDown, Trash2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────
type PositionGroup = 'disagree' | 'unsure' | 'agree';
type Intensity = 'somewhat' | 'default' | 'strongly';

interface PositionState {
  group: PositionGroup | null;
  intensity: Intensity | null;
}

// ─── Config ───────────────────────────────────────────────
const GROUP_CONFIG: Record<PositionGroup, {
  label: string;
  icon: typeof Check;
  intensities: { value: Intensity; label: string }[];
  shortLabels: Record<Intensity, string>;
}> = {
  disagree: {
    label: 'Disagree',
    icon: X,
    intensities: [
      { value: 'somewhat', label: 'Somewhat Disagree' },
      { value: 'default', label: 'Disagree' },
      { value: 'strongly', label: 'Strongly Disagree' },
    ],
    shortLabels: { somewhat: 'Disagree−', default: 'Disagree', strongly: 'Disagree+' },
  },
  unsure: {
    label: 'Unsure',
    icon: HelpCircle,
    intensities: [{ value: 'default', label: 'Unsure' }],
    shortLabels: { somewhat: 'Unsure', default: 'Unsure', strongly: 'Unsure' },
  },
  agree: {
    label: 'Agree',
    icon: Check,
    intensities: [
      { value: 'somewhat', label: 'Somewhat Agree' },
      { value: 'default', label: 'Agree' },
      { value: 'strongly', label: 'Strongly Agree' },
    ],
    shortLabels: { somewhat: 'Agree−', default: 'Agree', strongly: 'Agree+' },
  },
};

const GROUP_ORDER: PositionGroup[] = ['disagree', 'unsure', 'agree'];

function getFullLabel(group: PositionGroup, intensity: Intensity): string {
  const entry = GROUP_CONFIG[group].intensities.find(i => i.value === intensity);
  return entry?.label ?? GROUP_CONFIG[group].label;
}

function getShortLabel(group: PositionGroup, intensity: Intensity | null): string {
  if (!intensity) return GROUP_CONFIG[group].label;
  return GROUP_CONFIG[group].shortLabels[intensity];
}

// ─── v2: Option A — Auto-dropdown + Option C short labels ─
interface ProposedButtonsProps {
  userPosition: PositionState;
  counts: Record<PositionGroup, number>;
  onSelect: (group: PositionGroup, intensity: Intensity) => void;
  containerWidth: number;
  compact?: boolean;
}

function ProposedPositionButtons({ userPosition, counts, onSelect, containerWidth, compact = false }: ProposedButtonsProps) {
  const [openDropdown, setOpenDropdown] = useState<PositionGroup | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Two modes only: full labels (>= 270px) or icon-only (< 270px). No truncation.
  const iconOnly = containerWidth < 270;

  // Close dropdown on click outside
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdown]);

  // Close on Escape
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openDropdown]);

  const handleGroupClick = (group: PositionGroup) => {
    if (group === 'unsure') {
      onSelect(group, 'default');
      setOpenDropdown(null);
      return;
    }
    if (userPosition.group !== group) {
      onSelect(group, 'default');
    }
    setOpenDropdown(openDropdown === group ? null : group);
  };

  const handleIntensityClick = (group: PositionGroup, intensity: Intensity) => {
    onSelect(group, intensity);
    setOpenDropdown(null);
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="flex w-full rounded-lg border border-border bg-white">
        {GROUP_ORDER.map((group, index) => {
          const config = GROUP_CONFIG[group];
          const Icon = config.icon;
          const isActive = userPosition.group === group;
          const count = counts[group];
          const isOpen = openDropdown === group;
          const buttonLabel = isActive ? getShortLabel(group, userPosition.intensity) : config.label;

          return (
            <div key={group} className="relative flex-1 min-w-0" style={{ minHeight: 40 }}>
              <button
                onClick={() => handleGroupClick(group)}
                aria-pressed={isActive}
                aria-expanded={isOpen}
                className={[
                  'w-full h-full flex items-center justify-center gap-1 px-1.5 py-2 min-w-0',
                  'text-[11px] sm:text-xs font-medium transition-colors leading-none',
                  index === 0 ? 'rounded-l-lg' : '',
                  index === GROUP_ORDER.length - 1 ? 'rounded-r-lg' : '',
                  index > 0 ? 'border-l border-border' : '',
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50',
                ].join(' ')}
                style={{ minHeight: 40 }}
              >
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? '' : 'opacity-50'}`} strokeWidth={2.5} />
                {!iconOnly && <span>{buttonLabel}</span>}
                {count > 0 && !compact && !iconOnly && (
                  <span className={[
                    'flex-shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-medium leading-none',
                    isActive ? 'bg-white/30' : 'bg-gray-100 text-gray-500',
                  ].join(' ')}>
                    {count}
                  </span>
                )}
              </button>

              {/* Auto-dropdown for intensity */}
              {isOpen && config.intensities.length > 1 && (
                <div
                  className="absolute top-full mt-1 z-50 bg-white rounded-lg border border-border shadow-lg py-1 min-w-[170px]"
                  style={{
                    // Position: prefer centering, but clamp to not overflow right
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  {config.intensities.map(({ value, label }) => {
                    const isSelected = userPosition.group === group && userPosition.intensity === value;
                    return (
                      <button
                        key={value}
                        onClick={() => handleIntensityClick(group, value)}
                        className={[
                          'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                          isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50',
                        ].join(' ')}
                        style={{ minHeight: 40 }}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                        <span className={isSelected ? '' : 'pl-[22px]'}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── v3 (Model B): click toggles, chevron opens intensity ─
// Click anywhere on segment → selects default OR toggles off (preserves second-click-removes convention).
// Small chevron on the right of agree/disagree → opens intensity menu.
function V3PositionButtons({ userPosition, counts, onSelect, onClear, containerWidth }: {
  userPosition: PositionState;
  counts: Record<PositionGroup, number>;
  onSelect: (group: PositionGroup, intensity: Intensity) => void;
  onClear: () => void;
  containerWidth: number;
}) {
  const [openDropdown, setOpenDropdown] = useState<PositionGroup | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iconOnly = containerWidth < 270;

  useEffect(() => {
    if (!openDropdown) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [openDropdown]);

  const handleSegmentClick = (group: PositionGroup) => {
    if (group === 'unsure') {
      if (userPosition.group === 'unsure') onClear();
      else onSelect('unsure', 'default');
      return;
    }
    // Toggle-off if same group selected, else select default
    if (userPosition.group === group) onClear();
    else onSelect(group, 'default');
  };

  const handleChevronClick = (e: React.MouseEvent, group: PositionGroup) => {
    e.stopPropagation();
    setOpenDropdown(openDropdown === group ? null : group);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="flex w-full rounded-lg border border-border bg-white">
        {GROUP_ORDER.map((group, index) => {
          const config = GROUP_CONFIG[group];
          const Icon = config.icon;
          const isActive = userPosition.group === group;
          const count = counts[group];
          const buttonLabel = isActive ? getShortLabel(group, userPosition.intensity) : config.label;
          const hasChevron = config.intensities.length > 1;

          return (
            <div key={group} className="relative flex-1 min-w-0 flex" style={{ minHeight: 40 }}>
              <button
                onClick={() => handleSegmentClick(group)}
                aria-pressed={isActive}
                className={[
                  'flex-1 min-w-0 h-full flex items-center justify-center gap-1 px-1.5 py-2',
                  'text-[11px] sm:text-xs font-medium transition-colors leading-none',
                  index === 0 ? 'rounded-l-lg' : '',
                  index === GROUP_ORDER.length - 1 && !hasChevron ? 'rounded-r-lg' : '',
                  index > 0 ? 'border-l border-border' : '',
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? '' : 'opacity-50'}`} strokeWidth={2.5} />
                {!iconOnly && <span>{buttonLabel}</span>}
                {count > 0 && !iconOnly && (
                  <span className={[
                    'flex-shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-medium leading-none',
                    isActive ? 'bg-white/30' : 'bg-gray-100 text-gray-500',
                  ].join(' ')}>{count}</span>
                )}
              </button>
              {hasChevron && (
                <button
                  onClick={(e) => handleChevronClick(e, group)}
                  aria-label={`Choose ${config.label} intensity`}
                  className={[
                    'flex-shrink-0 px-1.5 flex items-center justify-center border-l',
                    index === GROUP_ORDER.length - 1 ? 'rounded-r-lg' : '',
                    isActive ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700' : 'text-gray-400 border-border hover:bg-gray-50',
                  ].join(' ')}
                >
                  <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
                </button>
              )}
              {openDropdown === group && hasChevron && (
                <div
                  className="absolute top-full right-0 mt-1 z-50 bg-white rounded-lg border border-border shadow-lg py-1 min-w-[170px]"
                >
                  {config.intensities.map(({ value, label }) => {
                    const isSelected = userPosition.group === group && userPosition.intensity === value;
                    return (
                      <button
                        key={value}
                        onClick={() => { onSelect(group, value); setOpenDropdown(null); }}
                        className={[
                          'w-full text-left px-3 py-2 text-sm flex items-center gap-2',
                          isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50',
                        ].join(' ')}
                        style={{ minHeight: 40 }}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                        <span className={isSelected ? '' : 'pl-[22px]'}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── v4 (Model C′): click selects, click-selected opens menu, Clear inside menu ─
// First click on a group → selects default intensity. No menu auto-opens.
// Click already-selected group → opens menu (intensity options + Clear row).
function V4PositionButtons({ userPosition, counts, onSelect, onClear, containerWidth }: {
  userPosition: PositionState;
  counts: Record<PositionGroup, number>;
  onSelect: (group: PositionGroup, intensity: Intensity) => void;
  onClear: () => void;
  containerWidth: number;
}) {
  const [openDropdown, setOpenDropdown] = useState<PositionGroup | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iconOnly = containerWidth < 270;

  useEffect(() => {
    if (!openDropdown) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [openDropdown]);

  const handleClick = (group: PositionGroup) => {
    if (group === 'unsure') {
      if (userPosition.group === 'unsure') setOpenDropdown(openDropdown === 'unsure' ? null : 'unsure');
      else { onSelect('unsure', 'default'); setOpenDropdown(null); }
      return;
    }
    if (userPosition.group === group) {
      setOpenDropdown(openDropdown === group ? null : group);
    } else {
      onSelect(group, 'default');
      setOpenDropdown(null);
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="flex w-full rounded-lg border border-border bg-white">
        {GROUP_ORDER.map((group, index) => {
          const config = GROUP_CONFIG[group];
          const Icon = config.icon;
          const isActive = userPosition.group === group;
          const count = counts[group];
          const isOpen = openDropdown === group;
          const buttonLabel = isActive ? getShortLabel(group, userPosition.intensity) : config.label;

          return (
            <div key={group} className="relative flex-1 min-w-0" style={{ minHeight: 40 }}>
              <button
                onClick={() => handleClick(group)}
                aria-pressed={isActive}
                aria-expanded={isActive ? isOpen : undefined}
                className={[
                  'w-full h-full flex items-center justify-center gap-1 px-1.5 py-2 min-w-0',
                  'text-[11px] sm:text-xs font-medium transition-colors leading-none',
                  index === 0 ? 'rounded-l-lg' : '',
                  index === GROUP_ORDER.length - 1 ? 'rounded-r-lg' : '',
                  index > 0 ? 'border-l border-border' : '',
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? '' : 'opacity-50'}`} strokeWidth={2.5} />
                {!iconOnly && <span>{buttonLabel}</span>}
                {count > 0 && !iconOnly && (
                  <span className={[
                    'flex-shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-medium leading-none',
                    isActive ? 'bg-white/30' : 'bg-gray-100 text-gray-500',
                  ].join(' ')}>{count}</span>
                )}
              </button>
              {isOpen && isActive && (
                <div
                  className="absolute top-full mt-1 z-50 bg-white rounded-lg border border-border shadow-lg py-1 min-w-[180px]"
                  style={{ left: '50%', transform: 'translateX(-50%)' }}
                >
                  {config.intensities.map(({ value, label }) => {
                    const isSelected = userPosition.intensity === value;
                    return (
                      <button
                        key={value}
                        onClick={() => { onSelect(group, value); setOpenDropdown(null); }}
                        className={[
                          'w-full text-left px-3 py-2 text-sm flex items-center gap-2',
                          isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50',
                        ].join(' ')}
                        style={{ minHeight: 40 }}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                        <span className={isSelected ? '' : 'pl-[22px]'}>{label}</span>
                      </button>
                    );
                  })}
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => { onClear(); setOpenDropdown(null); }}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-red-600 hover:bg-red-50"
                    style={{ minHeight: 40 }}
                  >
                    <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Clear position</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Model comparison scenario (V3 vs V4) ─────────────────
function ModelScenario({ title, description, initialCounts, pointText }: {
  title: string;
  description: string;
  initialCounts: Record<PositionGroup, number>;
  pointText: string;
}) {
  const [posB, setPosB] = useState<PositionState>({ group: null, intensity: null });
  const [posC, setPosC] = useState<PositionState>({ group: null, intensity: null });
  const [cntB, setCntB] = useState(initialCounts);
  const [cntC, setCntC] = useState(initialCounts);

  const selectB = useCallback((group: PositionGroup, intensity: Intensity) => {
    setCntB(prev => {
      const n = { ...prev };
      if (posB.group !== group) {
        if (posB.group) n[posB.group] = Math.max(0, n[posB.group] - 1);
        n[group] += 1;
      }
      return n;
    });
    setPosB({ group, intensity });
  }, [posB.group]);

  const clearB = useCallback(() => {
    setCntB(prev => {
      const n = { ...prev };
      if (posB.group) n[posB.group] = Math.max(0, n[posB.group] - 1);
      return n;
    });
    setPosB({ group: null, intensity: null });
  }, [posB.group]);

  const selectC = useCallback((group: PositionGroup, intensity: Intensity) => {
    setCntC(prev => {
      const n = { ...prev };
      if (posC.group !== group) {
        if (posC.group) n[posC.group] = Math.max(0, n[posC.group] - 1);
        n[group] += 1;
      }
      return n;
    });
    setPosC({ group, intensity });
  }, [posC.group]);

  const clearC = useCallback(() => {
    setCntC(prev => {
      const n = { ...prev };
      if (posC.group) n[posC.group] = Math.max(0, n[posC.group] - 1);
      return n;
    });
    setPosC({ group: null, intensity: null });
  }, [posC.group]);

  return (
    <div className="bg-white rounded-xl border border-border p-4 sm:p-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider mb-1">v3 — Model B</p>
          <p className="text-[10px] text-gray-500 mb-2">Click toggles (2nd click removes). Chevron opens intensity. Preserves toggle convention.</p>
          <div className="border-2 border-purple-200 rounded-lg p-3 bg-purple-50/30 mx-auto" style={{ maxWidth: 400 }}>
            <p className="text-xs text-gray-700 mb-3 leading-relaxed">{pointText}</p>
            <V3PositionButtons userPosition={posB} counts={cntB} onSelect={selectB} onClear={clearB} containerWidth={376} />
            <p className="text-[10px] text-gray-400 mt-2">{posB.group ? `Selected: ${getFullLabel(posB.group, posB.intensity ?? 'default')}` : 'No position'}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">v4 — Model C′</p>
          <p className="text-[10px] text-gray-500 mb-2">Click selects (no auto-menu). Click-selected opens menu with Clear row. No accidental removes.</p>
          <div className="border-2 border-emerald-200 rounded-lg p-3 bg-emerald-50/30 mx-auto" style={{ maxWidth: 400 }}>
            <p className="text-xs text-gray-700 mb-3 leading-relaxed">{pointText}</p>
            <V4PositionButtons userPosition={posC} counts={cntC} onSelect={selectC} onClear={clearC} containerWidth={376} />
            <p className="text-[10px] text-gray-400 mt-2">{posC.group ? `Selected: ${getFullLabel(posC.group, posC.intensity ?? 'default')}` : 'No position'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── v1: Current Position Buttons (for comparison) ────────
function CurrentPositionButtons({ userPosition, counts, onSelect, containerWidth }: {
  userPosition: PositionState;
  counts: Record<PositionGroup, number>;
  onSelect: (group: PositionGroup) => void;
  containerWidth: number;
}) {
  const icons = { disagree: X, unsure: HelpCircle, agree: Check };
  // v1 keeps its truncation behavior to show the contrast with v2
  const iconOnly = containerWidth < 200;
  const truncate = containerWidth >= 200 && containerWidth < 280;

  return (
    <div className="flex w-full rounded-lg border border-border bg-white">
      {GROUP_ORDER.map((group, index) => {
        const Icon = icons[group];
        const isActive = userPosition.group === group;
        const count = counts[group];
        const label = GROUP_CONFIG[group].label;
        const truncLabel = truncate ? label.slice(0, 3) + '...' : label;

        return (
          <div
            key={group}
            className={[
              'flex-1 min-w-0 flex items-center transition-colors',
              index > 0 ? 'border-l border-border' : '',
              isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
            ].join(' ')}
            style={{ minHeight: 36 }}
          >
            <button
              onClick={() => onSelect(group)}
              className="flex items-center gap-0.5 px-1 py-1.5 whitespace-nowrap text-[11px] font-medium min-w-0 truncate"
            >
              <Icon className="h-3 w-3 flex-shrink-0" />
              {!iconOnly && <span className="truncate">{truncLabel}</span>}
              <span className={`flex-shrink-0 ${isActive ? 'opacity-90' : 'opacity-50'}`}>({count})</span>
            </button>
            {group !== 'unsure' && (
              <span className="flex-shrink-0 pr-0.5 opacity-40">
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Viewport Simulator ───────────────────────────────────
const VIEWPORTS = [
  { label: 'Desktop', width: 500 },
  { label: 'Mobile', width: 400 },
  { label: 'Narrow', width: 360 },
  { label: 'Tiny', width: 320 },
  { label: 'Ultra', width: 280 },
] as const;

// ─── Interactive Scenario ─────────────────────────────────
function Scenario({ title, description, initialCounts, initialPosition, pointText }: {
  title: string;
  description: string;
  initialCounts: Record<PositionGroup, number>;
  initialPosition?: { group: PositionGroup; intensity: Intensity };
  pointText?: string;
}) {
  const [posV1, setPosV1] = useState<PositionState>(
    initialPosition ? { ...initialPosition } : { group: null, intensity: null }
  );
  const [posV2, setPosV2] = useState<PositionState>(
    initialPosition ? { ...initialPosition } : { group: null, intensity: null }
  );
  const [cntV1, setCntV1] = useState(initialCounts);
  const [cntV2, setCntV2] = useState(initialCounts);
  const [vpIdx, setVpIdx] = useState(1);
  const vp = VIEWPORTS[vpIdx];

  const selectV1 = useCallback((group: PositionGroup) => {
    setCntV1(prev => {
      const n = { ...prev };
      if (posV1.group) n[posV1.group] = Math.max(0, n[posV1.group] - 1);
      n[group] += 1;
      return n;
    });
    setPosV1({ group, intensity: 'default' });
  }, [posV1.group]);

  const selectV2 = useCallback((group: PositionGroup, intensity: Intensity) => {
    setCntV2(prev => {
      const n = { ...prev };
      if (posV2.group !== group) {
        if (posV2.group) n[posV2.group] = Math.max(0, n[posV2.group] - 1);
        n[group] += 1;
      }
      return n;
    });
    setPosV2({ group, intensity });
  }, [posV2.group]);

  return (
    <div className="bg-white rounded-xl border border-border p-4 sm:p-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {VIEWPORTS.map((v, i) => (
          <button
            key={v.label}
            onClick={() => setVpIdx(i)}
            className={`text-[10px] sm:text-xs px-2 py-1 rounded-full border transition-colors ${
              i === vpIdx ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-border hover:border-gray-400'
            }`}
          >
            {v.label} ({v.width}px)
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Current (v1)</p>
          <div className="border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50/50 mx-auto" style={{ maxWidth: vp.width }}>
            {pointText && <p className="text-xs text-gray-700 mb-3 leading-relaxed">{pointText}</p>}
            <CurrentPositionButtons userPosition={posV1} counts={cntV1} onSelect={selectV1} containerWidth={vp.width - 24} />
            {posV1.group && <p className="text-[10px] text-gray-400 mt-2">Selected: {posV1.group}</p>}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-2">Proposed (v2)</p>
          <div className="border-2 border-blue-200 rounded-lg p-3 bg-blue-50/30 mx-auto overflow-visible" style={{ maxWidth: vp.width }}>
            {pointText && <p className="text-xs text-gray-700 mb-3 leading-relaxed">{pointText}</p>}
            <ProposedPositionButtons userPosition={posV2} counts={cntV2} onSelect={selectV2} containerWidth={vp.width - 24} />
            {posV2.group && (
              <p className="text-[10px] text-gray-400 mt-2">
                Selected: {getFullLabel(posV2.group, posV2.intensity ?? 'moderate')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Context Mockup ───────────────────────────────────────
function ContextMockup({ label, surface, width, compact, narrow, counts, pointText }: {
  label: string;
  surface: string;
  width: number;
  compact?: boolean;
  narrow?: boolean;
  counts: Record<PositionGroup, number>;
  pointText: string;
}) {
  const [pos, setPos] = useState<PositionState>({ group: null, intensity: null });
  const [cnt, setCnt] = useState(counts);

  const handleSelect = useCallback((group: PositionGroup, intensity: Intensity) => {
    setCnt(prev => {
      const n = { ...prev };
      if (pos.group !== group) {
        if (pos.group) n[pos.group] = Math.max(0, n[pos.group] - 1);
        n[group] += 1;
      }
      return n;
    });
    setPos({ group, intensity });
  }, [pos.group]);

  // Button area ≈ card width minus padding (2×12) minus pin (24) minus gap (8)
  // But buttons are flex w-full inside the flex-1 content area, so they get the full remaining width
  const buttonWidth = width - 56;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2 mb-1">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-[10px] text-gray-400">{width}px{compact ? ' · compact' : ''}{narrow ? ' · narrow' : ''}</p>
      </div>
      <div className="text-[10px] text-gray-400 mb-1">{surface}</div>
      <div
        className="border border-border rounded-lg bg-white overflow-visible"
        style={{ maxWidth: width }}
      >
        <div className="p-3">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded bg-gray-200 flex-shrink-0 flex items-center justify-center">
              <span className="text-[8px] text-gray-400">pin</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-700 mb-2 leading-relaxed line-clamp-2">{pointText}</p>
              <ProposedPositionButtons
                userPosition={pos}
                counts={cnt}
                onSelect={handleSelect}
                containerWidth={buttonWidth}
                compact={compact}
              />
              {pos.group && (
                <p className="text-[9px] text-gray-400 mt-1">{getShortLabel(pos.group, pos.intensity)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export function PositionButtonsPrototype() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/tree" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </a>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Position Buttons — interaction models</h1>
            <p className="text-xs text-gray-500">v1/v2: label & dropdown styling. v3/v4: interaction model (toggle vs. explicit-clear).</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">v2 changes</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li><strong>Click Agree/Disagree</strong> → selects default + auto-opens intensity dropdown</li>
            <li><strong>Intensity label</strong>: Agree+ (strongly), Agree− (somewhat), Agree (default)</li>
            <li>Counts as badges only when &gt; 0. No chevrons. No truncated labels.</li>
          </ul>
        </div>

        {/* v3 vs v4 — interaction model comparison */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          <p className="font-semibold mb-1">Decide the interaction model (v3 vs v4)</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li><strong>v3 (B)</strong>: second click on selected group REMOVES it. Chevron opens intensity. Keeps existing toggle convention.</li>
            <li><strong>v4 (C′)</strong>: click never removes. Click-selected opens menu with explicit "Clear position" row.</li>
            <li>Touch both. Pick the one that matches your muscle memory.</li>
          </ul>
        </div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-2">v3 vs v4 — Interaction Model</h2>
        <ModelScenario
          title="Fresh point — try to vote, change intensity, then remove"
          description="Both: click Agree → selected. v3: click Agree again to remove, or chevron for intensity. v4: click Agree again opens menu with intensity + Clear."
          initialCounts={{ disagree: 1, unsure: 0, agree: 3 }}
          pointText="Remote work increases productivity for software teams."
        />
        <ModelScenario
          title="Pre-selected — what does clicking your active group do?"
          description="Start with Agree selected. Click Agree once: v3 removes it; v4 opens menu."
          initialCounts={{ disagree: 2, unsure: 1, agree: 5 }}
          pointText="AI will replace most junior developer roles within 5 years."
        />

        {/* v1 vs v2 comparison */}
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-2">v1 vs v2 Comparison (label & dropdown style)</h2>
        <Scenario
          title="Fresh point"
          description="Click Agree in v2 → selects + opens intensity. Pick Strongly → shows 'Agree+'"
          initialCounts={{ disagree: 0, unsure: 0, agree: 0 }}
          pointText="Remote work increases productivity for software teams."
        />
        <Scenario
          title="Mixed positions"
          description="v1: (2)(1)(5) always. v2: badges only when > 0."
          initialCounts={{ disagree: 2, unsure: 1, agree: 5 }}
          pointText="AI will replace most junior developer roles within 5 years."
        />
        <Scenario
          title="High counts"
          description="Badge display at 24, 8, 31."
          initialCounts={{ disagree: 24, unsure: 8, agree: 31 }}
          pointText="Universities should be free for all citizens."
        />

        {/* Real production contexts */}
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-4">Production Contexts (375px mobile)</h2>
        <p className="text-[10px] text-gray-400 -mt-4">
          Exact container widths from production. Click buttons — dropdowns must not clip.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ContextMockup
            label="Feed Point Card"
            surface="Widest container (299px)"
            width={299}
            counts={{ disagree: 2, unsure: 0, agree: 5 }}
            pointText="Remote work increases productivity for software teams."
          />
          <ContextMockup
            label="Quoted Point"
            surface="Inside quoted box (275px)"
            width={275}
            narrow
            counts={{ disagree: 1, unsure: 1, agree: 3 }}
            pointText="AI will replace most junior developer roles within 5 years."
          />
          <ContextMockup
            label="Point Detail"
            surface="Full page view (259px)"
            width={259}
            counts={{ disagree: 4, unsure: 2, agree: 8 }}
            pointText="Climate change is the most urgent challenge."
          />
          <ContextMockup
            label="Live Session"
            surface="Tightest container (235px)"
            width={235}
            compact
            narrow
            counts={{ disagree: 0, unsure: 0, agree: 1 }}
            pointText="Universities should be free for all citizens."
          />
        </div>

        {/* Stress tests */}
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-4">Stress Tests</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ContextMockup
            label="Ultra narrow"
            surface="200px — icon-only mode"
            width={200}
            compact
            narrow
            counts={{ disagree: 0, unsure: 0, agree: 0 }}
            pointText="Test point"
          />
          <ContextMockup
            label="With high counts"
            surface="250px — badges + tight"
            width={250}
            counts={{ disagree: 12, unsure: 5, agree: 18 }}
            pointText="Test with high counts"
          />
          <ContextMockup
            label="Desktop"
            surface="450px — comfortable"
            width={450}
            counts={{ disagree: 3, unsure: 0, agree: 7 }}
            pointText="Desktop width with spacing."
          />
        </div>

        {/* Live test */}
        <div className="bg-white rounded-xl border border-border p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Live test (your viewport)</h3>
          <p className="text-xs text-gray-500 mb-4">Resize browser to see real responsive behavior.</p>
          <LiveTest />
        </div>
      </div>
    </div>
  );
}

function LiveTest() {
  const [pos, setPos] = useState<PositionState>({ group: null, intensity: null });
  const [counts, setCounts] = useState<Record<PositionGroup, number>>({ disagree: 1, unsure: 0, agree: 3 });

  const handleSelect = useCallback((group: PositionGroup, intensity: Intensity) => {
    setCounts(prev => {
      const n = { ...prev };
      if (pos.group !== group) {
        if (pos.group) n[pos.group] = Math.max(0, n[pos.group] - 1);
        n[group] += 1;
      }
      return n;
    });
    setPos({ group, intensity });
  }, [pos.group]);

  const handleClear = useCallback(() => {
    setCounts(prev => {
      const n = { ...prev };
      if (pos.group) n[pos.group] = Math.max(0, n[pos.group] - 1);
      return n;
    });
    setPos({ group: null, intensity: null });
  }, [pos.group]);

  return (
    <div className="space-y-3">
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs text-gray-700 mb-3">"Open-plan offices decrease deep work capacity by 60%"</p>
        <ProposedPositionButtons userPosition={pos} counts={counts} onSelect={handleSelect} containerWidth={9999} />
      </div>
      {pos.group && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-500">
            Your position: <strong>{getFullLabel(pos.group, pos.intensity ?? 'moderate')}</strong>
            {' '}(button shows: {getShortLabel(pos.group, pos.intensity)})
          </p>
          <button onClick={handleClear} className="text-[10px] text-red-500 hover:text-red-700 underline">Clear</button>
        </div>
      )}
    </div>
  );
}

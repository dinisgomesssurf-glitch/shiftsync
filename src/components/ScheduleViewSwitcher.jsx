const MODES = [
  { k:'timeline', label:'Timeline', hint:'Detailed editing & overlap inspection' },
  { k:'compact',  label:'Compact',  hint:'Roster overview · scannable' },
  { k:'coverage', label:'Coverage', hint:'Staffing heatmap' },
]
const DENSITIES = [
  { k:'comfortable', label:'Comfortable' },
  { k:'compact',     label:'Compact' },
  { k:'dense',       label:'Dense' },
]

export default function ScheduleViewSwitcher({ mode, onMode, density, onDensity, hideEmpty, onHideEmpty }){
  return (
    <div className="schedule-toolbar">
      <div className="seg-control" role="tablist" aria-label="Schedule view">
        {MODES.map(m => (
          <button key={m.k}
            role="tab"
            aria-selected={mode===m.k}
            className={`seg-btn ${mode===m.k?'active':''}`}
            onClick={()=>onMode(m.k)}
            title={m.hint}>
            {m.label}
          </button>
        ))}
      </div>

      {mode==='timeline' && (
        <>
          <div className="seg-control" role="radiogroup" aria-label="Density">
            {DENSITIES.map(d => (
              <button key={d.k}
                role="radio"
                aria-checked={density===d.k}
                className={`seg-btn small ${density===d.k?'active':''}`}
                onClick={()=>onDensity(d.k)}>
                {d.label}
              </button>
            ))}
          </div>
          <label className="toolbar-check">
            <input type="checkbox" checked={!!hideEmpty} onChange={e=>onHideEmpty(e.target.checked)}/>
            Hide empty hours
          </label>
        </>
      )}
    </div>
  )
}

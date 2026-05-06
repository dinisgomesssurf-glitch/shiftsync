import { useMemo, useState } from 'react'
import ScheduleViewSwitcher from './ScheduleViewSwitcher'
import ScheduleTimeline from './ScheduleTimeline'
import ScheduleCompact from './ScheduleCompact'
import ScheduleCoverage from './ScheduleCoverage'
import ScheduleRoster from './ScheduleRoster'
import { detectConflicts } from '../lib/scheduleEngine'

export default function ScheduleView({
  shiftsByDay, daySettings, axisS, axisE,
  staffingReqs, members, cannotAlone,
  editable, onEditShift, showUnderstaffed, published,
}){
  const [mode, setMode]         = useState('timeline')
  const [density, setDensity]   = useState('comfortable')
  const [hideEmpty, setHideEmpty] = useState(false)

  // Conflict pass once, shared by all modes.
  const { conflictsSet, reasons } = useMemo(() => {
    return detectConflicts(shiftsByDay)
  }, [shiftsByDay])

  return (
    <div className="schedule-view">
      <ScheduleViewSwitcher
        mode={mode} onMode={setMode}
        density={density} onDensity={setDensity}
        hideEmpty={hideEmpty} onHideEmpty={setHideEmpty}
      />

      {mode === 'timeline' && (
        <ScheduleTimeline
          shiftsByDay={shiftsByDay}
          daySettings={daySettings}
          axisS={axisS} axisE={axisE}
          staffingReqs={staffingReqs} editable={editable}
          members={members} onEditShift={onEditShift}
          cannotAlone={cannotAlone} showUnderstaffed={showUnderstaffed}
          density={density} hideEmpty={hideEmpty}
          conflictsSet={conflictsSet} reasons={reasons}
          published={published}
        />
      )}

      {mode === 'compact' && (
        <ScheduleCompact
          shiftsByDay={shiftsByDay}
          members={members} onEditShift={onEditShift} editable={editable}
          conflictsSet={conflictsSet} reasons={reasons} published={published}
        />
      )}

      {mode === 'coverage' && (
        <ScheduleCoverage
          shiftsByDay={shiftsByDay}
          staffingReqs={staffingReqs}
          daySettings={daySettings}
          axisS={axisS} axisE={axisE}
        />
      )}

      <ScheduleRoster shiftsByDay={shiftsByDay} members={members}/>
    </div>
  )
}

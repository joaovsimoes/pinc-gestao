(() => {
  'use strict';
  function clockMinutes(value) {
    const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/);
    if(!match||Number(match[1])>23||Number(match[2])>59)return null;
    return Number(match[1])*60+Number(match[2]);
  }
  function dateClock(value) {
    const d=new Date(value);
    return Number.isFinite(d.getTime())?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:null;
  }
  function difference(actual,planned) {
    const a=clockMinutes(actual),p=clockMinutes(planned);if(a==null||p==null)return null;
    let delta=a-p;if(delta>720)delta-=1440;if(delta<-720)delta+=1440;return delta;
  }
  function shift(time,minutes) {
    const base=clockMinutes(time);if(base==null)return null;
    const total=((base+Math.round(Number(minutes)||0))%1440+1440)%1440;
    return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
  }
  function actualTimes(agenda,reports,index) {
    const stage=agenda[index]||[];
    const report=[...(reports||[])].reverse().find(r=>r.stageIndex!=null&&r.stageIndex!==''&&Number.isInteger(Number(r.stageIndex))?Number(r.stageIndex)===index:r.stage===stage[0]);
    return {start:report?.actualStart||stage[6]||dateClock(report?.startedAt)||'',end:report?.actualEnd||stage[7]||dateClock(report?.finishedAt)||'',report};
  }
  function delay({agenda=[],live={},reports=[],now=Date.now()}) {
    if(!agenda.length)return 0;
    const index=Math.max(0,Number(live.activeIndex)||0),current=agenda[index];
    if(live.running&&current&&live.startedAt){
      const startMs=new Date(live.startedAt).getTime();
      if(Number.isFinite(startMs)){
        const startOffset=difference(dateClock(startMs),current[2]);
        if(startOffset!=null){
          const elapsed=Math.max(0,(now-startMs)/60000+Number(live.elapsedBefore||0)/60);
          return Math.round(startOffset+Math.max(0,elapsed-Number(current[3]||0)));
        }
      }
    }
    // Actual clock times capture duration changes and pauses without counting them twice.
    const completed=Math.min(agenda.length,Math.max(Number(live.completed)||0,index));
    let offset=0,hasCompleted=false;
    for(let i=0;i<completed;i++){
      const actual=actualTimes(agenda,reports,i),plannedEnd=agenda[i][5]||shift(agenda[i][2],Number(agenda[i][3]||0));
      const endOffset=difference(actual.end,plannedEnd);
      if(endOffset!=null){offset=endOffset;hasCompleted=true}
      else if(actual.report&&Number.isFinite(Number(actual.report.actual))){offset+=Number(actual.report.actual)-Number(actual.report.planned??agenda[i][3]??0);hasCompleted=true}
    }
    // While waiting for the next stage, its predicted start cannot remain in the past.
    if(current&&hasCompleted){const waitOffset=difference(dateClock(now),current[2]);if(waitOffset!=null)offset=Math.max(offset,waitOffset)}
    if(current&&!hasCompleted){const startOffset=difference(actualTimes(agenda,reports,index).start,current[2]);if(startOffset!=null)offset=startOffset}
    return Math.round(offset);
  }
  window.PINC_SCHEDULE={clockMinutes,dateClock,difference,shift,actualTimes,delay};
})();

export function bgmScene(place,weather){return ['park','cafe','beach'].includes(place)?place:['rain','night'].includes(weather)?weather:'day';}
export function bgmPolicy({enabled,armed,hidden,roomHidden,externalMusic,activity,voiceVisible,humming,volume}){
 const blocked=!enabled||!armed||hidden||roomHidden||externalMusic||['permission','listening','recognizing'].includes(activity);
 return {play:!blocked,volume:Math.max(0,Math.min(.5,Number(volume)||0))*(voiceVisible||humming||['speaking','preparing'].includes(activity)?.2:1)};
}

// One timer, no catch-up bursts. A user gesture is required after opening the page.
export function createIdleScheduler({canPlay,play,stop,onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,random=Math.random}) {
  let timer,armed=false,enabled=true;
  function schedule(){clearTimer(timer);if(armed&&enabled)timer=setTimer(tick,25000+Math.floor(random()*10001));}
  async function tick(){
    timer=undefined;
    if(!armed||!enabled)return;
    if(canPlay())try{await play();}catch(error){armed=false;stop();onError(error);}
    schedule();
  }
  return {
    touch(){armed=true;stop();schedule();},
    suspend(){stop();schedule();},
    enable(value){enabled=value;stop();schedule();},
    async preview(){armed=true;stop();if(canPlay())try{await play();}catch(error){armed=false;stop();onError(error);}schedule();},
    dispose(){armed=false;clearTimer(timer);stop();},
  };
}

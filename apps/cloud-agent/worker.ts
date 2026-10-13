import {claimNextTask,closeStore,databaseMode,failTask,finishTask,requeueStaleTasks,touchTask} from "./lib/store";
import {runSkill} from "./lib/agent";

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const RECOVERY_INTERVAL_MS=60_000;
const HEARTBEAT_INTERVAL_MS=60_000;

async function main(){
  if(await databaseMode()!=="postgres")throw new Error("Worker requires DATABASE_URL so web and worker share a durable queue.");
  await requeueStaleTasks();
  console.log("[cloud-agent-worker] polling PostgreSQL queue");
  let stopping=false;
  const stop=()=>{stopping=true;};
  process.on("SIGINT",stop);
  process.on("SIGTERM",stop);
  const recoveryTimer=setInterval(()=>{void requeueStaleTasks().then(count=>{if(count)console.warn(JSON.stringify({event:"task.requeued_stale",count}));}).catch(e=>console.error("[cloud-agent-worker] recovery error:",e instanceof Error?e.message:e));},RECOVERY_INTERVAL_MS);
  try{
    while(!stopping){
      const t=await claimNextTask();
      if(!t){await sleep(1000);continue;}
      const heartbeat=setInterval(()=>{void touchTask(t.id).catch(e=>console.error("[cloud-agent-worker] heartbeat error:",e instanceof Error?e.message:e));},HEARTBEAT_INTERVAL_MS);
      try{
        await finishTask(t.id,await runSkill(t.skill,t.input));
        console.log(JSON.stringify({event:"task.completed",taskId:t.id,skill:t.skill}));
      }catch(e){
        const message=e instanceof Error?e.message:"Unknown worker error";
        await failTask(t.id,message);
        console.error(JSON.stringify({event:"task.failed",taskId:t.id,message}));
      }finally{clearInterval(heartbeat);}
    }
  }finally{clearInterval(recoveryTimer);await closeStore();}
}
main().catch(e=>{console.error("[cloud-agent-worker] fatal:",e instanceof Error?e.message:e);process.exitCode=1;});

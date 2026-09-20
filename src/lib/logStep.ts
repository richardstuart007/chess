'use server'

import { write_logging } from 'nextjs-shared/write_logging'

//----------------------------------------------------------------------------------
//  logStart / logEnd — call-hierarchy tracing for xlg_logging
//
//  Params:
//    functionName — the function starting
//    caller — the pipeline or caller it runs under
//    description — what the function is about to do
//    level — logging level
//----------------------------------------------------------------------------------
export async function logStart(functionName: string, caller: string, description: string, level: number): Promise<void> {
  await write_logging({
    lg_functionname: functionName,
    lg_caller: caller,
    lg_msg: `Start function ${functionName} - ${description}`,
    lg_severity: 'I',
    lg_level: level
  })
}

//----------------------------------------------------------------------------------
//  logEnd — logs the end of a pipeline function with its outcome
//
//  Params:
//    functionName — the function that finished
//    caller — the pipeline or caller it runs under
//    status — the outcome message
//    level — logging level
//----------------------------------------------------------------------------------
export async function logEnd(functionName: string, caller: string, status: string, level: number): Promise<void> {
  await write_logging({
    lg_functionname: functionName,
    lg_caller: caller,
    lg_msg: `End function ${functionName} - ${status}`,
    lg_severity: 'I',
    lg_level: level
  })
}

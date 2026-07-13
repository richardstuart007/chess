'use server'

import { write_logging } from 'nextjs-shared/write_logging'

//----------------------------------------------------------------------------------
//  logStart / logEnd — dev-mode 'D'-severity call-hierarchy tracing for xlg_logging
//----------------------------------------------------------------------------------
export async function logStart(functionName: string, caller: string, description: string, level: number): Promise<void> {
  await write_logging({
    lg_functionname: functionName,
    lg_caller: caller,
    lg_msg: `Start function ${functionName} - ${description}`,
    lg_severity: 'D',
    lg_level: level
  })
}

export async function logEnd(functionName: string, caller: string, status: string, level: number): Promise<void> {
  await write_logging({
    lg_functionname: functionName,
    lg_caller: caller,
    lg_msg: `End function ${functionName} - ${status}`,
    lg_severity: 'D',
    lg_level: level
  })
}

'use client'

import FilterSelect from './FilterSelect'
import { OPTIONS_PIPELINE_TYPE, WIDTH_PIPELINE_TYPE } from '@/src/lib/constants'

interface PipelineTypeSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
  borderClass?: string
}

//----------------------------------------------------------------------------------------------
//  PipelineTypeSelect — pip_pipeline_type filter (PipelineLogTable)
//----------------------------------------------------------------------------------------------
export default function PipelineTypeSelect({ value, onChange, label, width = WIDTH_PIPELINE_TYPE, borderClass }: PipelineTypeSelectProps) {
  return (
    <FilterSelect
      label={label}
      options={OPTIONS_PIPELINE_TYPE}
      value={value}
      onChange={onChange}
      width={width}
      borderClass={borderClass}
    />
  )
}

'use client'

//==================================================================================================
//  1) DESCRIPTION
//    PipelineTypeSelect — pip_pipeline_type filter (PipelineLogTable).
//
//    Parameters:
//      value       — current selected pipeline-type value
//      onChange    — called with the new value on selection
//      label       — filter label text
//      width       — override width class (default WIDTH_PIPELINE_TYPE)
//      borderClass — override border color classes
//==================================================================================================

import FilterSelect from './FilterSelect'
import { OPTIONS_PIPELINE_TYPE, WIDTH_PIPELINE_TYPE } from '@/src/lib/constants'

interface PipelineTypeSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  width?: string
  borderClass?: string
}

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

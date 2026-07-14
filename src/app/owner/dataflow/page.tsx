import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Metadata } from 'next'
import { parseMarkdownLite, buildSectionTree } from '@/src/lib/parseMarkdownLite'
import MarkdownLiteView from '@/src/ui/MarkdownLiteView'

export const metadata: Metadata = { title: 'Dataflow' }

export default async function DataflowPage() {
  const filePath = path.join(process.cwd(), 'docs', 'Dataflow.md')
  const markdown = await readFile(filePath, 'utf-8')
  const blocks = parseMarkdownLite(markdown)
  const tree = buildSectionTree(blocks)

  return (
    <div className='w-full p-6 md:p-8'>
      <MarkdownLiteView tree={tree} />
    </div>
  )
}

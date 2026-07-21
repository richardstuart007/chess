import { MyTab } from 'nextjs-shared/MyTab'

type Props = React.ComponentProps<typeof MyTab>

const AppTab_underlineActiveClass = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px border-blue-600 text-blue-600'
const AppTab_underlineInactiveClass = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px border-transparent text-gray-500 hover:text-gray-700'

//----------------------------------------------------------------------------------------------
//  AppTab — project-wide wrapper around nextjs-shared/MyTab; overrides the underline variant's
//  classes to match this project's existing tab look (px-4/py-2/text-blue-600). Pill variant is
//  left at MyTab's own defaults, which already match this project's existing pill tabs.
//----------------------------------------------------------------------------------------------
export default function AppTab(props: Props) {
  return (
    <MyTab
      underlineActiveClass={AppTab_underlineActiveClass}
      underlineInactiveClass={AppTab_underlineInactiveClass}
      {...props}
    />
  )
}

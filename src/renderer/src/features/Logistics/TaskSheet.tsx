import { Drawer } from 'antd'
import CraftTaskView from './tasks/CraftTaskView'
import RefineryTaskView from './tasks/RefineryTaskView'
import MpfTaskView from './tasks/MpfTaskView'
import TransportTaskView from './tasks/TransportTaskView'

export interface TaskContext {
  category: 'transport' | 'craft' | 'resource' | 'mpf'
  locationId: number
  locationName: string
  payload: unknown
  locations: Record<string, { name?: string; title?: string }>
}

interface Props {
  task: TaskContext | null
  onClose: () => void
  onChanged: () => void
}

const TITLES: Record<TaskContext['category'], string> = {
  transport: 'Transport',
  craft: 'Craft',
  resource: 'Refine',
  mpf: 'MPF'
}

// Transient action panel that routes to a category-specific UI.
export default function TaskSheet({ task, onClose, onChanged }: Props): React.ReactElement {
  const changed = (): void => {
    onChanged()
    onClose()
  }

  return (
    <Drawer
      title={task ? `${TITLES[task.category]} — ${task.locationName}` : ''}
      open={!!task}
      onClose={onClose}
      placement="left"
      width="100%"
      // No X — tasks close through their finish/done controls in the header.
      closable={false}
      // Task views portal header widgets (progress, finish) into this slot.
      extra={<div id="task-sheet-extra" />}
      styles={{
        header: { padding: '8px 14px' },
        body: { padding: '8px 12px' }
      }}
      getContainer={false}
      destroyOnHidden
    >
      {!task ? null : task.category === 'craft' ? (
        <CraftTaskView
          locationId={task.locationId}
          payload={task.payload as { items?: Record<string, number> }}
          onChanged={changed}
        />
      ) : task.category === 'resource' ? (
        <RefineryTaskView
          locationId={task.locationId}
          payload={task.payload as Record<string, { crates?: number }>}
          onChanged={changed}
        />
      ) : task.category === 'mpf' ? (
        <MpfTaskView locationId={task.locationId} onChanged={changed} />
      ) : (
        <TransportTaskView
          locationId={task.locationId}
          locationName={task.locationName}
          payload={task.payload as React.ComponentProps<typeof TransportTaskView>['payload']}
          locations={task.locations}
          onChanged={changed}
        />
      )}
    </Drawer>
  )
}

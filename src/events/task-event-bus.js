import { EventEmitter } from 'node:events';

export class TaskEventBus extends EventEmitter {
	emitTaskCreated(task) {
		this.emit('task:created', task);
	}
    emitTaskUpdated(task) {
        this.emit('task:updated', task);
    }
    emitTaskDeleted(task) {
        this.emit('task:deleted', task);
    }
}

export const taskEventBus = new TaskEventBus();
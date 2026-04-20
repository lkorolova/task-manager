import { EventEmitter } from 'node:events';
import type { Task } from '../types/task.js';

export class TaskEventBus extends EventEmitter {
	emitTaskCreated(task: Task) {
		this.emit('task:created', task);
	}
    emitTaskUpdated(task: Task) {
        this.emit('task:updated', task);
    }
    emitTaskDeleted(id: string) {
        this.emit('task:deleted', id);
    }
}

export const taskEventBus = new TaskEventBus();
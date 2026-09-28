import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import { taskService, TaskService } from "@/services/task.service";
import { CreateTaskDto, UpdateTaskDto } from "@/dto/task.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class TaskController {
  constructor(private svc: TaskService = taskService) {}

  async createTask(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.TASK_CREATE, "Task");
      if (!authResult.isAuthorized) return authResult.response;

      const data: CreateTaskDto = await request.json();

      if (!data.title || !data.assignedTo || !data.assignedBy || !data.dueDate) {
        return NextResponse.json(
          { success: false, message: "Required fields are missing" },
          { status: 400 }
        );
      }

      const task = await this.svc.createTask(data);
      return NextResponse.json(
        { success: true, message: "Task created successfully", data: task },
        { status: 201 }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json(
        { success: false, message: err?.message || "Failed to create task" },
        { status: 500 }
      );
    }
  }

  async getTasks(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.TASK_VIEW, "Task");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(request.url);
      const assignedTo = searchParams.get("assignedTo");

      let tasks;
      if (assignedTo) {
        tasks = await this.svc.getTasksByAssignedUser(assignedTo);
      } else {
        tasks = await this.svc.getAllTasks();
      }

      return NextResponse.json(
        { success: true, count: tasks.length, data: tasks },
        { status: 200 }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json(
        { success: false, message: err?.message || "Failed to fetch tasks" },
        { status: 500 }
      );
    }
  }

  async getTaskById(id: string, request?: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      if (request) {
        const authResult = await authorizeRequest(request, PERMISSION_KEYS.TASK_VIEW, "Task");
        if (!authResult.isAuthorized) return authResult.response;
      }

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json(
          { success: false, message: "Invalid task ID" },
          { status: 400 }
        );
      }

      const task = await this.svc.getTaskById(id);
      if (!task) {
        return NextResponse.json(
          { success: false, message: "Task not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: true, data: task },
        { status: 200 }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json(
        { success: false, message: err?.message || "Failed to fetch task" },
        { status: 500 }
      );
    }
  }

  async updateTask(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.TASK_UPDATE, "Task");
      if (!authResult.isAuthorized) return authResult.response;

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json(
          { success: false, message: "Invalid task ID" },
          { status: 400 }
        );
      }

      const data: UpdateTaskDto = await request.json();
      const task = await this.svc.updateTask(id, data);
      if (!task) {
        return NextResponse.json(
          { success: false, message: "Task not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: true, message: "Task updated successfully", data: task },
        { status: 200 }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json(
        { success: false, message: err?.message || "Failed to update task" },
        { status: 500 }
      );
    }
  }

  async deleteTask(id: string, request?: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      if (request) {
        const authResult = await authorizeRequest(request, PERMISSION_KEYS.TASK_UPDATE, "Task");
        if (!authResult.isAuthorized) return authResult.response;
      }

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json(
          { success: false, message: "Invalid task ID" },
          { status: 400 }
        );
      }

      const task = await this.svc.deleteTask(id);
      if (!task) {
        return NextResponse.json(
          { success: false, message: "Task not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: true, message: "Task deleted successfully" },
        { status: 200 }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json(
        { success: false, message: err?.message || "Failed to delete task" },
        { status: 500 }
      );
    }
  }
}

const taskController = new TaskController();
export default taskController;

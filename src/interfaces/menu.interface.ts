import { Document, Types } from "mongoose";

export interface IMenu extends Document {
    name: string;
    path: string;
    icon: string;
    moduleKey?: string;
    children: Types.ObjectId[];
}
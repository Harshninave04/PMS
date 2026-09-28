import { Schema, model, Types, models } from "mongoose";
import { IMenu } from "@/interfaces/menu.interface";

const menuSchema = new Schema<IMenu>({
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true
    },
    path: {
        type: String,
        trim: true,
        default: ""
    },
    icon: {
        type: String,
        trim: true,
        default: ""
    },
    moduleKey: {
        type: String,
        trim: true,
        default: "",
        index: true
    },
    children: {
        type: [Types.ObjectId],
        ref: "Menu",
        default: []
    }
}, { timestamps: true });

export default models?.Menu || model<IMenu>("Menu", menuSchema);
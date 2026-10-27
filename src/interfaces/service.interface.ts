import { Document } from "mongoose";

export interface IService extends Document {
    name: string;
    category: string;
    /** Rate pre-filled when the service is picked in Create Bill. */
    defaultRate: number;
    active: boolean;
}

export default IService;

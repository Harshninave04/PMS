import mongoose, { Schema, model, Types } from "mongoose"
import { IRoom } from "@/interfaces/room.interface"

const roomSchema = new Schema<IRoom>(
    {
        roomNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        roomType: {
            type: String,
            enum: [
                "GENERAL",
                "PRIVATE",
                "SEMI_PRIVATE",
                "ICU",
                "ISOLATION",
                "DELUXE",
            ],
            default: 'GENERAL'
        },
        wardId: {
            type: Types.ObjectId,
            ref: 'Ward',
            required: true
        },
        /**
         * Denormalised from the parent Ward at creation time so a BRANCH-scoped
         * user can be filtered without a join. Room had no branch field before,
         * which made branch scoping impossible to express.
         */
        organizationId: {
            type: Types.ObjectId,
            ref: 'Organization',
            index: true
        },
        description: {
            type: String,
        },
        isActive: {
            type: Boolean,
            default: true
        }
    }, { timestamps: true })

const Room = mongoose.models.Room || mongoose.model<IRoom>('Room', roomSchema);
export default Room;
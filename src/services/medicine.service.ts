import Medicine from "@/models/medicine.model";
import { IMedicine } from "@/interfaces/medicine.interface";

export class MedicineService {
    static async searchSuggestions(query: string) {
        const expression = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const fields = "name strength dosageForm stockQuantity reorderLevel";
        const prefix = await Medicine.find({
            isActive: true,
            name: { $regex: `^${expression}`, $options: "i" },
        })
            .select(fields)
            .sort({ name: 1 })
            .limit(10)
            .lean();
        const remainder = prefix.length < 10
            ? await Medicine.find({
                  isActive: true,
                  name: { $regex: expression, $options: "i" },
                  _id: { $nin: prefix.map((medicine) => medicine._id) },
              })
                  .select(fields)
                  .sort({ name: 1 })
                  .limit(10 - prefix.length)
                  .lean()
            : [];
        return [...prefix, ...remainder];
    }

    static async create(data: Partial<IMedicine>) {
        return Medicine.create(data);
    }

    static async getAll(filter: any = {}) {
        return Medicine.find(filter).sort({ createdAt: -1 });
    }

    static async getById(id: string) {
        return Medicine.findById(id);
    }

    static async update(id: string, data: Partial<IMedicine>) {
        return Medicine.findByIdAndUpdate(id, data, { new: true });
    }

    static async delete(id: string) {
        return Medicine.findByIdAndDelete(id);
    }
}

export default MedicineService;

"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RegisterNewPatientButton({
    onClick,
    className
}: {
    onClick: () => void;
    className?: string;
}) {
    return (
        <Button type="button" variant="outline" className={`gap-1.5 ${className || ""}`} onClick={onClick}>
            <Plus className="h-4 w-4" /> Register New Patient
        </Button>
    );
}

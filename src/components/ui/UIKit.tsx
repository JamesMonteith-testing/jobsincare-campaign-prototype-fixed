// src/components/ui/UIKit.tsx
import React from "react";

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v:boolean)=>void; disabled?: boolean; }){
  return (
    <button onClick={()=>!disabled && onChange(!checked)} className={`relative inline-flex h-6 w-10 items-center rounded-full ${checked ? "bg-blue-600" : "bg-gray-300"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

export function StatusBadge({ status }:{ status: "Live" | "Expired" | "Pending"}) {
  const cls = status==="Live"?"bg-green-100 text-green-700":status==="Expired"?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}

export function Pill({ children, tone="muted" }:{children: React.ReactNode; tone?:"muted"|"info"|"ok"}){
  const map = { muted: "bg-gray-100 text-gray-700", info: "bg-blue-50 text-blue-700", ok:"bg-emerald-50 text-emerald-700" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${map[tone]}`}>{children}</span>;
}

export function CurrencyInput({ label, value, onChange }:{label:string; value:number; onChange:(n:number)=>void}){
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <span className="px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-sm">£</span>
        <input type="number" min={0} step={1} value={value} onChange={(e)=>onChange(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
    </div>
  );
}

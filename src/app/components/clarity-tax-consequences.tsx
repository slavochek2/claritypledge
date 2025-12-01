import { RefreshCwIcon, AlertTriangleIcon, ShieldOffIcon } from "lucide-react";

export function ClarityTaxConsequences() {
  const consequences = [
    { icon: RefreshCwIcon, label: "Rework" },
    { icon: AlertTriangleIcon, label: "Mistakes" },
    { icon: ShieldOffIcon, label: "Mistrust" },
  ];

  return (
    <div className="mb-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 max-w-3xl mx-auto">
        {consequences.map((item, index) => (
          <div key={index} className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 lg:w-20 lg:h-20 flex items-center justify-center">
              <item.icon className="w-full h-full text-blue-500 stroke-[1.5]" />
            </div>
            <span className="text-lg lg:text-xl font-medium text-foreground">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

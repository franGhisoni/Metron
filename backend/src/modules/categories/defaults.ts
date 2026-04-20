export const DEFAULT_CATEGORIES: Array<{
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string;
}> = [
  // Income
  { name: "Salario", type: "income", color: "#10b981", icon: "💼" },
  { name: "Freelance", type: "income", color: "#14b8a6", icon: "🧑‍💻" },
  { name: "Inversiones", type: "income", color: "#06b6d4", icon: "📈" },
  { name: "Otros ingresos", type: "income", color: "#84cc16", icon: "✨" },
  // Expense
  { name: "Supermercado", type: "expense", color: "#ef4444", icon: "🛒" },
  { name: "Restaurantes", type: "expense", color: "#f97316", icon: "🍽️" },
  { name: "Transporte", type: "expense", color: "#f59e0b", icon: "🚗" },
  { name: "Servicios", type: "expense", color: "#eab308", icon: "💡" },
  { name: "Alquiler", type: "expense", color: "#dc2626", icon: "🏠" },
  { name: "Salud", type: "expense", color: "#ec4899", icon: "⚕️" },
  { name: "Entretenimiento", type: "expense", color: "#a855f7", icon: "🎬" },
  { name: "Ropa", type: "expense", color: "#8b5cf6", icon: "👕" },
  { name: "Educación", type: "expense", color: "#6366f1", icon: "📚" },
  { name: "Suscripciones", type: "expense", color: "#3b82f6", icon: "🔁" },
  { name: "Impuestos", type: "expense", color: "#475569", icon: "🧾" },
  { name: "Otros", type: "expense", color: "#64748b", icon: "📦" },
];

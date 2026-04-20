import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../lib/auth";

const LoginSchema = z.object({
  email: z.string().email("email inválido"),
  password: z.string().min(1, "requerido"),
});
type LoginForm = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(LoginSchema) });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      await login(data.email, data.password);
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";
      navigate(from, { replace: true });
    } catch {
      setServerError("Credenciales inválidas");
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6"
      >
        <h1 className="text-xl font-semibold text-white">Ingresar</h1>
        <Field label="Email" error={errors.email?.message}>
          <input type="email" {...register("email")} className={inputCls} autoComplete="email" />
        </Field>
        <Field label="Contraseña" error={errors.password?.message}>
          <input
            type="password"
            {...register("password")}
            className={inputCls}
            autoComplete="current-password"
          />
        </Field>
        {serverError && <p className="text-sm text-red-400">{serverError}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {isSubmitting ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="text-center text-sm text-slate-400">
          ¿Sin cuenta?{" "}
          <Link to="/register" className="text-brand-500 hover:underline">
            Crear una
          </Link>
        </p>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand-500";

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <label className="block space-y-1">
    <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
    {children}
    {error && <span className="text-xs text-red-400">{error}</span>}
  </label>
);

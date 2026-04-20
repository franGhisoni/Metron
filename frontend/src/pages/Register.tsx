import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../lib/auth";

const RegisterSchema = z.object({
  email: z.string().email("email inválido"),
  password: z.string().min(8, "mínimo 8 caracteres"),
  phone: z.string().trim().min(5).max(32).optional().or(z.literal("")),
});
type RegisterForm = z.infer<typeof RegisterSchema>;

export default function RegisterPage() {
  const { user, register: doRegister } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(RegisterSchema) });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (data: RegisterForm) => {
    setServerError(null);
    try {
      await doRegister(data.email, data.password, data.phone || undefined);
      navigate("/", { replace: true });
    } catch (err) {
      const ax = err as AxiosError<{ error?: string }>;
      if (ax.response?.status === 409) setServerError("Ese email ya está registrado");
      else setServerError("No pudimos crear la cuenta");
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6"
      >
        <h1 className="text-xl font-semibold text-white">Crear cuenta</h1>
        <Field label="Email" error={errors.email?.message}>
          <input type="email" {...register("email")} className={inputCls} autoComplete="email" />
        </Field>
        <Field label="Contraseña" error={errors.password?.message}>
          <input
            type="password"
            {...register("password")}
            className={inputCls}
            autoComplete="new-password"
          />
        </Field>
        <Field
          label="Teléfono (opcional, para WhatsApp a futuro)"
          error={errors.phone?.message}
        >
          <input type="tel" {...register("phone")} className={inputCls} autoComplete="tel" />
        </Field>
        {serverError && <p className="text-sm text-red-400">{serverError}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {isSubmitting ? "Creando…" : "Crear cuenta"}
        </button>
        <p className="text-center text-sm text-slate-400">
          ¿Ya tenés cuenta?{" "}
          <Link to="/login" className="text-brand-500 hover:underline">
            Ingresar
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

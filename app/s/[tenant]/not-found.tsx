export default function TenantNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center">
      <h1 className="text-2xl font-bold text-neutral-900">Menú no encontrado</h1>
      <p className="mt-2 text-neutral-500">
        Este menú no existe o aún no está publicado.
      </p>
    </main>
  );
}

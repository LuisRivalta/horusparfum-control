interface FinContasProps {
  tipo: 'pagar' | 'receber'
}

export function FinContas({ tipo }: FinContasProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Financeiro</p>
        <h1 className="text-3xl font-medium tracking-tight mt-1">
          Contas a {tipo}
        </h1>
      </div>
    </div>
  )
}

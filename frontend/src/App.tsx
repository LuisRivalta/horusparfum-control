import { Routes, Route } from 'react-router-dom'
import { Home } from '@/pages/home/Home'
import { Login } from '@/pages/auth/Login'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { FinDashboard } from '@/pages/financeiro/Dashboard'
import { FinTransacoes } from '@/pages/financeiro/Transacoes'
import { FinContas } from '@/pages/financeiro/Contas'
import { FinRelatorios } from '@/pages/financeiro/Relatorios'
import { FinMetas } from '@/pages/financeiro/Metas'
import { EstProdutos } from '@/pages/estoque/Produtos'
import { EstEstoque } from '@/pages/estoque/EstoqueView'
import { EstPedidos } from '@/pages/estoque/Pedidos'
import { EstCategorias } from '@/pages/estoque/Categorias'
import { EstFornecedores } from '@/pages/estoque/Fornecedores'
import { EstAlertas } from '@/pages/estoque/Alertas'
import { EstRelatorios } from '@/pages/estoque/Relatorios'
import { EstDivergencias } from '@/pages/estoque/Divergencias'
import { EstDecants } from '@/pages/estoque/Decants'
import { EstVendas } from '@/pages/estoque/Vendas'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/financeiro" element={<FinDashboard />} />
        <Route path="/financeiro/transacoes" element={<FinTransacoes />} />
        <Route path="/financeiro/contas-pagar" element={<FinContas tipo="pagar" />} />
        <Route path="/financeiro/contas-receber" element={<FinContas tipo="receber" />} />
        <Route path="/financeiro/relatorios" element={<FinRelatorios />} />
        <Route path="/financeiro/metas" element={<FinMetas />} />
        <Route path="/estoque" element={<EstEstoque />} />
        <Route path="/estoque/vendas" element={<EstVendas />} />
        <Route path="/estoque/produtos" element={<EstProdutos />} />
        <Route path="/estoque/pedidos" element={<EstPedidos />} />
        <Route path="/estoque/divergencias" element={<EstDivergencias />} />
        <Route path="/estoque/decants" element={<EstDecants />} />
        <Route path="/estoque/categorias" element={<EstCategorias />} />
        <Route path="/estoque/fornecedores" element={<EstFornecedores />} />
        <Route path="/estoque/alertas" element={<EstAlertas />} />
        <Route path="/estoque/relatorios" element={<EstRelatorios />} />
      </Route>
    </Routes>
  )
}

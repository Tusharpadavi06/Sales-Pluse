import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Target as TargetIcon, 
  TrendingUp, 
  Filter,
  Search,
  BarChart3
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '@/src/components/ui';
import { BRANCHES, UNITS, YEARS, MONTHS } from '@/src/constants';
import { Profile, DashboardFilters } from '@/src/types';
import { formatCurrency, cn } from '@/src/lib/utils';
import { supabase } from '@/src/lib/supabase';

interface DashboardProps {
  user: Profile;
}

const COLORS = ['#000000', '#333333', '#666666', '#999999', '#CCCCCC'];

export default function Dashboard({ user }: DashboardProps) {
  const [filters, setFilters] = useState<DashboardFilters>({
    customer: '',
    year: YEARS[2],
    month: 'All',
    unit: 'All',
    branch: user.role === 'Admin' ? 'All' : user.branch_ids[0],
    employee: 'All'
  });

  const [kpis, setKpis] = useState({
    uniqueCustomers: 0,
    totalTarget: 0,
    totalActual: 0,
    achievement: 0
  });

  const [chartData, setChartData] = useState({
    unitPerformance: [],
    employeePerformance: [],
    revenueMix: [],
    monthlyTrend: []
  });

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Profile[]>([]);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      if (error) throw error;
      if (data) setEmployees(data);
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      let query = supabase.from('Sales_database').select('*');
      
      // Apply Role-Based Restrictions
      if (user.role === 'Sales Person') {
        query = query.eq('salesperson_id', user.id);
      } else if (user.role === 'Branch Head') {
        query = query.in('branch_id', user.branch_ids);
      }

      // Apply User Filters
      if (filters.branch !== 'All') query = query.eq('branch_id', filters.branch);
      if (filters.unit !== 'All') query = query.eq('Unit_name', filters.unit);
      if (filters.year) query = query.eq('year', filters.year);
      if (filters.month !== 'All') query = query.eq('month', filters.month);
      
      // Fixed: Filter by exact salesperson_id (UUID)
      if (filters.employee !== 'All' && filters.employee) {
        query = query.eq('salesperson_id', filters.employee);
      }
      
      if (filters.customer) query = query.ilike('customer_name', `%${filters.customer}%`);

      const { data: salesData, error: salesError } = await query;
      if (salesError) throw salesError;

      // Filter monthly if specified within the query results for charts primarily
      const monthFilteredData = filters.month === 'All' 
        ? salesData 
        : salesData?.filter(s => s.month === filters.month) || [];

      // Calculate KPIs
      const uniqueCustomers = new Set(salesData?.map(s => s.customer_name)).size;
      const totalTarget = monthFilteredData.reduce((acc, s) => acc + (Number(s.target_amount) || 0), 0);
      const totalActual = monthFilteredData.reduce((acc, s) => acc + (Number(s.actual_amount) || 0), 0);
      const achievement = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

      setKpis({
        uniqueCustomers,
        totalTarget,
        totalActual,
        achievement: parseFloat(achievement.toFixed(1))
      });

      // Prepare Chart Data
      // Unit Performance
      const unitsMap: any = {};
      UNITS.forEach(u => unitsMap[u] = { name: u, target: 0, actual: 0 });
      salesData?.forEach(s => { 
        if (unitsMap[s.Unit_name]) {
          unitsMap[s.Unit_name].target += Number(s.target_amount) || 0;
          unitsMap[s.Unit_name].actual += Number(s.actual_amount) || 0;
        }
      });
      
      // Employee Performance
      const empMap: any = {};
      salesData?.forEach(s => {
        const salespersonId = s.salesperson_id;
        if (!empMap[salespersonId]) {
          const emp = employees.find(e => e.id === salespersonId);
          empMap[salespersonId] = { name: emp?.full_name || 'Staff', target: 0, actual: 0 };
        }
        empMap[salespersonId].target += Number(s.target_amount) || 0;
        empMap[salespersonId].actual += Number(s.actual_amount) || 0;
      });

      // Revenue Mix by Branch
      const branchMap: any = {};
      salesData?.forEach(s => {
        const b = s.branch_id;
        branchMap[b] = (branchMap[b] || 0) + (Number(s.actual_amount) || 0);
      });

      // Monthly Trend
      const trendMap: any = {};
      MONTHS.forEach(m => trendMap[m] = { month: m.substring(0, 3), target: 0, actual: 0 });
      salesData?.forEach(s => {
        if (trendMap[s.month]) {
          trendMap[s.month].target += Number(s.target_amount) || 0;
          trendMap[s.month].actual += Number(s.actual_amount) || 0;
        }
      });

      setChartData({
        unitPerformance: Object.values(unitsMap).filter((u: any) => u.target > 0 || u.actual > 0),
        employeePerformance: Object.values(empMap).slice(0, 6),
        revenueMix: Object.entries(branchMap).map(([name, value]) => ({ name, value })),
        monthlyTrend: MONTHS.map(m => trendMap[m])
      });

    } catch (error) {
      console.error('Dashboard Fetch Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [filters.branch]);

  useEffect(() => {
    fetchDashboardData();
  }, [filters]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black italic tracking-tighter">Performance Hub</h2>
          <p className="text-zinc-400 text-sm font-medium">Real-time sales tracking & analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Report Export
          </Button>
        </div>
      </header>

      {/* Filters */}
      <Card className="rounded-2xl border-none shadow-sm bg-white overflow-visible">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Customer</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                <Input 
                  placeholder="Search..." 
                  className="h-9 pl-9 text-xs border-zinc-100 bg-zinc-50 rounded-lg"
                  value={filters.customer}
                  spellCheck={false}
                  data-gramm="false"
                  onChange={e => setFilters({...filters, customer: e.target.value})}
                />
              </div>
            </div>
            
            {/* Branch Filter - Only for Admin/Branch Head */}
            {(user.role === 'Admin' || user.role === 'Branch Head') && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Branch</label>
                <select 
                  className="w-full h-9 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-lg focus:ring-1 focus:ring-black outline-none appearance-none"
                  value={filters.branch}
                  onChange={e => setFilters({...filters, branch: e.target.value, employee: 'All'})}
                  disabled={user.role !== 'Admin'}
                >
                  <option value="All">All Branches</option>
                  {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Unit</label>
              <select 
                className="w-full h-9 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-lg focus:ring-1 focus:ring-black outline-none appearance-none"
                value={filters.unit}
                onChange={e => setFilters({...filters, unit: e.target.value})}
              >
                <option value="All">All Units</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Fiscal Year</label>
              <select 
                className="w-full h-9 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-lg focus:ring-1 focus:ring-black outline-none appearance-none"
                value={filters.year}
                onChange={e => setFilters({...filters, year: e.target.value})}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Month</label>
              <select 
                className="w-full h-9 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-lg focus:ring-1 focus:ring-black outline-none appearance-none"
                value={filters.month}
                onChange={e => setFilters({...filters, month: e.target.value})}
              >
                <option value="All">All Months</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Employee Filter - Only for Admin/Branch Head */}
            {(user.role === 'Admin' || user.role === 'Branch Head') && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Employee</label>
                <select 
                  className="w-full h-9 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-lg focus:ring-1 focus:ring-black outline-none appearance-none font-bold"
                  value={filters.employee}
                  onChange={e => setFilters({...filters, employee: e.target.value})}
                >
                  <option value="All">All Staff</option>
                  {employees
                    .filter(e => filters.branch === 'All' || e.branch_ids?.includes(filters.branch))
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Unique Customers', value: kpis.uniqueCustomers, icon: Users, color: 'text-blue-600' },
          { label: 'Total Target', value: formatCurrency(kpis.totalTarget), icon: TargetIcon, color: 'text-black' },
          { label: 'Total Actual', value: formatCurrency(kpis.totalActual), icon: TrendingUp, color: 'text-green-600' },
          { label: 'Achievement %', value: `${kpis.achievement}%`, icon: BarChart3, color: 'text-orange-600' }
        ].map((kpi, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow group overflow-hidden">
            <CardContent className="p-6 relative">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-400">{kpi.label}</p>
                  <p className={cn("text-2xl font-black tabular-nums ", kpi.color)}>{kpi.value}</p>
                </div>
                <div className="p-2 bg-zinc-50 rounded-xl group-hover:bg-zinc-100 transition-colors">
                  <kpi.icon className="h-5 w-5 text-zinc-400" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 h-1 bg-zinc-50 w-full">
                <div className="h-full bg-black/5 w-2/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm h-[400px]">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-zinc-400">Unit Wise Target vs Actual</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px] w-full min-h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.unitPerformance}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8f8f8' }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="target" fill="#e5e7eb" radius={[4, 4, 0, 0]} name="Planned" />
                <Bar dataKey="actual" fill="#000000" radius={[4, 4, 0, 0]} name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm h-[400px]">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-zinc-400">Monthly Achievement Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" />
                <Line type="monotone" dataKey="target" stroke="#e5e7eb" strokeWidth={3} dot={{ r: 4 }} name="Trend Line" />
                <Line type="monotone" dataKey="actual" stroke="#000000" strokeWidth={3} dot={{ r: 6, fill: '#000' }} name="Performance" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm h-[400px]">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-zinc-400">Employee Sales Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.employeePerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="actual" fill="#000000" radius={[0, 4, 4, 0]} name="Value (INR)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm h-[400px]">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-zinc-400">Branch Revenue Contribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.revenueMix}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.revenueMix.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

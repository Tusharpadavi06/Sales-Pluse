import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, TrendingUp, Filter, Search } from 'lucide-react';
import { Card, CardContent, Button, Input } from '@/src/components/ui';
import { BRANCHES, UNITS, YEARS, MONTHS } from '@/src/constants';
import { Profile } from '@/src/types';
import { formatCurrency, cn } from '@/src/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/src/lib/supabase';

interface ActualEntryProps {
  user: Profile;
  entries: any[];
  setEntries: React.Dispatch<React.SetStateAction<any[]>>;
  filters: any;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
}

interface EntryCell {
  target: number;
  actual: number;
  gap: number;
}

export default function ActualEntry({ user, entries, setEntries, filters, setFilters }: ActualEntryProps) {
  const [loading, setLoading] = useState(false);
  const [dirtyCells, setDirtyCells] = useState<Set<string>>(new Set());
  
  // Use global filters from props
  const currentFilters = filters;

  const updateFilters = (newFilters: any) => {
    setFilters(newFilters);
  };
  
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [filterMetadata, setFilterMetadata] = useState<any[]>([]);

  const fetchFilterMetadata = async () => {
    try {
      const { data, error } = await supabase
        .from('Sales_database')
        .select('branch_id, Unit_name, salesperson_id');
      if (error) throw error;
      if (data) setFilterMetadata(data);
    } catch (err) {
      console.error('Error fetching filter metadata:', err);
    }
  };

  const displayEntries = entries.filter(e => 
    (e.customer_name || '').toLowerCase().includes((filters.customer || '').toLowerCase())
  );

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

  const [availableUnits, setAvailableUnits] = useState<string[]>(UNITS);

  const fetchData = async () => {
    setLoading(true);
    try {
      let salesData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase.from('Sales_database').select('*').range(page * pageSize, (page + 1) * pageSize - 1);
        
        // Role-based filtering
        if (user.role === 'Sales Person') {
          query = query.eq('salesperson_id', user.id);
        } else if (user.role === 'Branch Head') {
          const effectiveBranchIds = [...new Set(user.branch_ids.flatMap((b: string) => 
            b === 'Bangalore' || b === 'Banglore' ? ['Bangalore', 'Banglore'] : [b]
          ))];
          query = query.in('branch_id', effectiveBranchIds);
        }

        if (currentFilters.branch !== 'All') {
          if (currentFilters.branch === 'Bangalore' || currentFilters.branch === 'Banglore') {
            query = query.in('branch_id', ['Bangalore', 'Banglore']);
          } else {
            query = query.eq('branch_id', currentFilters.branch);
          }
        }
        if (currentFilters.unit !== 'All') query = query.eq('Unit_name', currentFilters.unit);
        if (currentFilters.year !== 'All' && currentFilters.year) query = query.eq('year', currentFilters.year);
        
        if (currentFilters.employee !== 'All' && currentFilters.employee) {
          query = query.eq('salesperson_id', currentFilters.employee);
        }

        const { data: pageData, error } = await query;
        if (error) throw error;

        if (pageData && pageData.length > 0) {
          salesData = [...salesData, ...pageData];
          if (pageData.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
        
        if (page > 50) break;
      }

      if (salesData.length > 0) {
        const groupedRows: Record<string, any> = {};
        
        salesData.forEach(record => {
          let sid = record.salesperson_id;
          const matchingEmp = employees.find(e => e.id === sid || e.full_name === sid);
          if (matchingEmp) sid = matchingEmp.id;

          // Normalize branch_id for grouping
          const displayBranch = record.branch_id === 'Banglore' ? 'Bangalore' : record.branch_id;
          const key = `${record.customer_name}-${record.Unit_name}-${sid}-${displayBranch}`;
          
          if (!groupedRows[key]) {
            groupedRows[key] = {
              id: key,
              customer_name: record.customer_name,
              branch: displayBranch,
              unit: record.Unit_name,
              salesperson_id: sid,
              monthData: {}
            };
          }
          
          if (!groupedRows[key].monthData[record.month]) {
            groupedRows[key].monthData[record.month] = {
              target: 0,
              actual: 0,
              gap: 0,
              record_id: record.id // Store first ID
            };
          }
          
          groupedRows[key].monthData[record.month].target += Number(record.target_amount) || 0;
          groupedRows[key].monthData[record.month].actual += Number(record.actual_amount) || 0;
          groupedRows[key].monthData[record.month].gap = groupedRows[key].monthData[record.month].actual - groupedRows[key].monthData[record.month].target;
        });

        const finalEntries = Object.values(groupedRows).map(row => {
          MONTHS.forEach(m => {
            if (!row.monthData[m]) {
              row.monthData[m] = { target: 0, actual: 0, gap: 0, record_id: null };
            }
          });
          return row;
        }).sort((a: any, b: any) => 
          (a.customer_name || '').localeCompare(b.customer_name || '')
        );

        setEntries(finalEntries);

        // Cascading Units
        if (currentFilters.unit === 'All') {
          const unitsWithData = Array.from(new Set(salesData.map(s => s.Unit_name))).filter(Boolean) as string[];
          if (unitsWithData.length > 0) setAvailableUnits(unitsWithData.sort());
        } else if (currentFilters.branch === 'All' && currentFilters.employee === 'All') {
          setAvailableUnits(UNITS);
        }
      } else {
        setEntries([]);
      }
    } catch (error) {
      console.error('Fetch Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchFilterMetadata();
  }, [currentFilters.branch]);

  useEffect(() => {
    fetchData();
  }, [filters.branch, filters.unit, filters.year, filters.employee, employees]);

  const updateActual = (rowId: string, month: string, valueStr: string) => {
    setDirtyCells(prev => new Set(prev).add(`${rowId}-${month}`));
    const parsedVal = valueStr === '' ? '' : (parseFloat(valueStr) || 0);
    setEntries(prev => prev.map(entry => {
      if (entry.id === rowId) {
        const currentData = entry.monthData[month];
        const numericVal = parsedVal === '' ? 0 : parsedVal;
        const newGap = numericVal - currentData.target;
        return {
          ...entry,
          monthData: {
            ...entry.monthData,
            [month]: { ...currentData, actual: parsedVal, gap: newGap }
          }
        };
      }
      return entry;
    }));
  };

  const handleSave = async () => {
    if (dirtyCells.size === 0) {
      toast.info('No values have been modified');
      return;
    }

    setLoading(true);
    try {
      const updatePromises: any[] = [];
      
      entries.forEach(entry => {
        Object.entries(entry.monthData).forEach(([month, data]: [string, any]) => {
          if (dirtyCells.has(`${entry.id}-${month}`)) {
            const existingId = data.record_id;
            const amountValue = Number(data.actual) || 0;
            if (existingId && String(existingId).length > 5) {
              const updatePromise = supabase
                .from('Sales_database')
                .update({ actual_amount: amountValue })
                .eq('id', existingId);
              updatePromises.push(updatePromise);
            } else {
              const insertPromise = supabase
                .from('Sales_database')
                .insert({
                  customer_name: entry.customer_name,
                  Unit_name: entry.unit,
                  month: month,
                  year: currentFilters.year,
                  actual_amount: amountValue,
                  target_amount: 0,
                  branch_id: entry.branch,
                  salesperson_id: entry.salesperson_id
                });
              updatePromises.push(insertPromise);
            }
          }
        });
      });

      if (updatePromises.length === 0) {
        toast.info('No valid records to update');
        setDirtyCells(new Set());
        return;
      }

      const results = await Promise.all(updatePromises);
      
      const failed = results.find(r => r.error);
      if (failed) {
        throw failed.error;
      }

      toast.success('Actuals committed to Sales Database');
      setDirtyCells(new Set());
      fetchData();
    } catch (error) {
      console.error('Save Error:', error);
      toast.error(`Failed to commit updates: ${error instanceof Error ? error.message : 'Unknown Error'}`);
    } finally {
      setLoading(false);
    }
  };

  const totalPlanned = entries.reduce((acc, e) => {
    return acc + Object.values(e.monthData).reduce((sum: number, m: any) => sum + m.target, 0);
  }, 0);

  const aggregateActual = entries.reduce((acc, e) => {
    return acc + Object.values(e.monthData).reduce((sum: number, m: any) => sum + m.actual, 0);
  }, 0);

  const totalGap = totalPlanned === 0 && aggregateActual === 0 ? 0 : (aggregateActual - totalPlanned);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <header className="flex items-center justify-between bg-black text-white p-6 rounded-3xl shadow-xl shadow-black/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-2xl">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black italic tracking-tighter">Monthly Pipeline Entry</h2>
            <p className="text-white/50 text-xs font-bold uppercase tracking-widest">Fiscal Cycle: {currentFilters.year}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={loading} className="bg-white text-black hover:bg-zinc-200 px-6 h-10 font-black gap-2">
            <Save className="h-4 w-4" />
            {loading ? 'COMMITTING...' : 'COMMIT UPDATES'}
          </Button>
        </div>
      </header>

      {/* Master Filters - NEW */}
      <Card className="rounded-2xl border-none shadow-sm bg-white overflow-hidden border border-zinc-100">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(user.role === 'Admin' || user.role === 'Branch Head') && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Branch Context</label>
                <select 
                  className="w-full h-10 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-xl outline-none focus:ring-1 focus:ring-black appearance-none font-bold"
                  value={currentFilters.branch}
                  onChange={e => updateFilters({...currentFilters, branch: e.target.value, employee: 'All'})}
                >
                  {user.role === 'Admin' && <option value="All">All Branches</option>}
                  {user.role === 'Branch Head' && user.branch_ids?.length > 1 && <option value="All">All My Branches</option>}
                  {BRANCHES
                    .filter(b => user.role === 'Admin' || user.branch_ids?.includes(b))
                    .map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Unit Type</label>
              <select 
                className="w-full h-10 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-xl outline-none focus:ring-1 focus:ring-black appearance-none font-bold"
                value={currentFilters.unit}
                onChange={e => updateFilters({...currentFilters, unit: e.target.value})}
              >
                <option value="All">All Units</option>
                {UNITS
                  .filter(u => {
                    if (currentFilters.branch === 'All' && currentFilters.employee === 'All') return true;
                    return filterMetadata.some(m => 
                      (currentFilters.branch === 'All' || m.branch_id === currentFilters.branch) &&
                      (currentFilters.employee === 'All' || m.salesperson_id === currentFilters.employee || 
                       employees.find(e => e.id === currentFilters.employee)?.full_name === m.salesperson_id) &&
                      m.Unit_name === u
                    );
                  })
                  .map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Fiscal Year</label>
              <select 
                className="w-full h-10 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-xl outline-none focus:ring-1 focus:ring-black appearance-none font-bold"
                value={currentFilters.year}
                onChange={e => updateFilters({...currentFilters, year: e.target.value})}
              >
                <option value="All">All Years</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {(user.role === 'Admin' || user.role === 'Branch Head') && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Managed Staff</label>
                <select 
                  className="w-full h-10 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-xl outline-none focus:ring-1 focus:ring-black appearance-none font-bold"
                  value={currentFilters.employee}
                  onChange={e => updateFilters({...currentFilters, employee: e.target.value})}
                >
                  <option value="All">All Staff</option>
                  {employees
                    .filter(e => {
                      // Cascading Logic: Filter employees based on selected branch
                      if (currentFilters.branch !== 'All' && !e.branch_ids?.includes(currentFilters.branch)) return false;
                      
                      // If user is a Branch Head, they should see employees in their permitted branches
                      if (user.role === 'Branch Head') {
                        return e.branch_ids?.some(bid => user.branch_ids?.includes(bid));
                      }
                      
                      if (user.role === 'Sales Person') {
                         return e.id === user.id;
                      }

                      return true;
                    })
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="space-y-1 col-span-2 lg:col-span-1">
              <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Search Customer</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <Input 
                  placeholder="Filter entries..."
                  className="h-10 pl-9 text-xs bg-zinc-50 border-zinc-100 rounded-xl font-bold"
                  value={filters.customer || ''}
                  onChange={e => updateFilters({...filters, customer: e.target.value})}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-zinc-50/80 border-b border-zinc-100">
                  <th className="p-4 text-left text-[10px] font-black uppercase text-zinc-400 tracking-widest sticky left-0 bg-zinc-50 z-10">Entity Context</th>
                  {MONTHS.map(month => (
                    <th key={month} className="p-4 text-center text-[10px] font-black uppercase tracking-widest min-w-[220px] text-zinc-400">
                      {month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {displayEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-zinc-50/30 transition-colors group">
                    <td className="p-4 sticky left-0 bg-white shadow-[2px_0_10px_-4px_rgba(0,0,0,0.1)] z-10">
                      <p className="text-sm font-black text-black leading-tight mb-1">{entry.customer_name}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                          <AlertCircle className="h-2 w-2" /> {entry.unit}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded uppercase">
                          {employees.find(e => e.id === entry.salesperson_id || e.full_name === entry.salesperson_id)?.full_name || entry.salesperson_id || 'Unassigned'}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-300 italic">@{entry.branch}</span>
                      </div>
                    </td>
                    
                    {MONTHS.map(month => {
                      const data = entry.monthData[month] || { target: 0, actual: 0, gap: 0 };
                      
                      return (
                        <td key={month} className="p-4 transition-all border-x border-zinc-50">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between px-3 py-1 bg-zinc-100/50 rounded-lg">
                              <span className="text-[8px] font-black text-zinc-400 uppercase">Target Value</span>
                              <span className="text-[10px] font-black tabular-nums">{formatCurrency(data.target)}</span>
                            </div>
                            
                            <div className="relative group/input">
                              <label className="absolute -top-2 left-2 px-1 bg-white text-[7px] font-black text-zinc-300 uppercase z-10">Actual Amount</label>
                              <Input 
                                type="number"
                                className="h-9 px-2 text-[10px] font-bold tabular-nums rounded-lg border-zinc-200"
                                placeholder={formatCurrency(data.target)}
                                value={data.actual === undefined || data.actual === null ? '' : data.actual}
                                spellCheck={false}
                                data-gramm="false"
                                onChange={e => updateActual(entry.id, month, e.target.value)}
                              />
                            </div>
                            
                            <div className={cn(
                              "flex items-center justify-between px-3 py-1.5 rounded-lg border border-dashed",
                              data.gap > 0 ? "bg-green-50 border-green-100" : (data.gap < 0 ? "bg-red-50 border-red-100" : "bg-zinc-50 border-zinc-100")
                            )}>
                              <span className="text-[9px] font-black text-zinc-500 uppercase">GAP</span>
                              <span className={cn(
                                "text-[10px] font-black tabular-nums",
                                data.gap > 0 ? "text-green-600" : (data.gap < 0 ? "text-red-500" : "text-zinc-600")
                              )}>
                                {data.gap > 0 ? `+${formatCurrency(data.gap)}` : (data.gap < 0 ? `-${formatCurrency(Math.abs(data.gap))}` : formatCurrency(0))}
                              </span>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-zinc-900 text-white p-6 rounded-3xl border-none">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-8">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Total Planned</p>
              <p className="text-2xl font-black italic tracking-tighter tabular-nums">{formatCurrency(totalPlanned)}</p>
            </div>
            <div className="h-10 w-[1px] bg-zinc-800" />
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Aggregate Actual</p>
              <p className="text-2xl font-black italic tracking-tighter tabular-nums">{formatCurrency(aggregateActual)}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
             <p className={cn(
               "text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
               totalGap < 0 ? "text-red-500" : "text-green-500"
             )}>
               {totalGap < 0 ? <AlertCircle className="h-3 w-3" /> : null} 
               {totalGap < 0 ? "Critical Pipeline Gap" : "Target Achieved"}
             </p>
             <p className={cn(
               "text-3xl font-black italic tracking-tighter",
               totalGap < 0 ? "text-red-500" : "text-green-500"
             )}>{totalGap > 0 ? `+${formatCurrency(totalGap)}` : (totalGap < 0 ? `-${formatCurrency(Math.abs(totalGap))}` : formatCurrency(0))}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

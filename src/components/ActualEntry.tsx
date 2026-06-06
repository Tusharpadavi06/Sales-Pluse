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
  actual: string | number;
  gap: number;
}

// Helper to chronologically compute carry-over gaps and adjusted targets for an entry
export const computeMonthDataForEntry = (entry: any) => {
  const computedMonthData: Record<string, {
    target: number;
    totalTarget: number;
    actual: string | number;
    gap: number;
    carryForward: number;
    record_id: any;
    all_record_ids?: any[];
  }> = {};

  let prevGap = 0;

  for (let i = 0; i < MONTHS.length; i++) {
    const month = MONTHS[i];
    const data = entry.monthData[month] || { target: 0, actual: '', gap: 0, record_id: null };
    
    const originalTarget = Number(data.target) || 0;
    const actualRaw = data.actual;
    
    // Check if actual is entered (not blank, null, undefined, or 0)
    const isActualEntered = actualRaw !== undefined && actualRaw !== null && actualRaw !== '' && Number(actualRaw) !== 0;
    const actualNum = isActualEntered ? Number(actualRaw) : 0;
    
    // Gap from previous month is carried over
    const carryForward = prevGap;
    
    // Adjusted Target = Original Target - Carry Forward
    // If the previous month had a negative gap (deficit), we subtract negative => add the deficit to this month's target.
    // If the previous month had a positive gap (surplus), we subtract positive => reduce this month's target.
    const totalTarget = originalTarget - carryForward;
    
    // New gap for this month - computed only if actual is physically entered.
    // Otherwise, gap is neutral (0) and does not ripple to next month.
    const gap = isActualEntered ? (actualNum - totalTarget) : 0;

    computedMonthData[month] = {
      target: originalTarget,
      totalTarget: totalTarget,
      actual: isActualEntered ? actualRaw : '',
      gap: gap,
      carryForward: carryForward,
      record_id: data.record_id,
      all_record_ids: data.all_record_ids
    };

    // Update prevGap for the next cell in sequence
    prevGap = gap;
  }

  return computedMonthData;
};

// Optimized cell input with local state to prevent render lag when typing
function ActualCellInput({ 
  value, 
  placeholder, 
  onChange, 
  hasActual 
}: { 
  value: string | number; 
  placeholder: string; 
  onChange: (val: string) => void;
  hasActual: boolean;
}) {
  const [localVal, setLocalVal] = React.useState<string>(() => {
    if (value === undefined || value === null || value === '' || Number(value) === 0) {
      return '';
    }
    return String(value);
  });
  
  const lastPropValue = React.useRef(value);

  // Sync with prop when database is saved, filtered, or updated
  React.useEffect(() => {
    if (value !== lastPropValue.current) {
      if (value === undefined || value === null || value === '' || Number(value) === 0) {
        setLocalVal('');
      } else {
        setLocalVal(String(value));
      }
      lastPropValue.current = value;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(e.target.value);
  };

  const handleBlur = () => {
    if (String(value ?? '') !== localVal && !(localVal === '' && (value === undefined || value === null || Number(value) === 0))) {
      onChange(localVal);
      lastPropValue.current = localVal;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input 
      type="number"
      className={cn(
        "h-10 px-2.5 text-[11px] tabular-nums rounded-lg border-zinc-300 transition-colors pt-1.5",
        hasActual 
          ? "bg-yellow-100 border-yellow-400 text-black font-black focus:bg-yellow-50 focus:border-yellow-500 shadow-sm" 
          : "font-bold text-zinc-800"
      )}
      placeholder={placeholder}
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      spellCheck={false}
      data-gramm="false"
    />
  );
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
              actual: '',
              gap: 0,
              record_id: record.id, // Store first ID
              all_record_ids: []
            };
          }
          
          groupedRows[key].monthData[record.month].target += Number(record.target_amount) || 0;
          
          const recordActual = record.actual_amount;
          if (recordActual !== null && recordActual !== undefined && recordActual !== '') {
            const currentActualVal = groupedRows[key].monthData[record.month].actual;
            const currentNum = currentActualVal === '' ? 0 : Number(currentActualVal);
            const sumVal = currentNum + Number(recordActual);
            groupedRows[key].monthData[record.month].actual = sumVal === 0 ? '' : sumVal;
          }
          
          if (!groupedRows[key].monthData[record.month].all_record_ids) {
            groupedRows[key].monthData[record.month].all_record_ids = [];
          }
          groupedRows[key].monthData[record.month].all_record_ids.push(record.id);
        });

        const finalEntries = Object.values(groupedRows).map(row => {
          MONTHS.forEach(m => {
            if (!row.monthData[m]) {
              row.monthData[m] = { target: 0, actual: '', gap: 0, record_id: null };
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [filters.branch, filters.unit, filters.year, filters.employee]);

  const updateActual = (rowId: string, month: string, valueStr: string) => {
    setDirtyCells(prev => {
      const nextSet = new Set(prev);
      nextSet.add(`${rowId}-${month}`);
      return nextSet;
    });
    const parsedVal = valueStr === '' ? '' : valueStr;
    setEntries(prev => prev.map(entry => {
      if (entry.id === rowId) {
        const currentData = entry.monthData[month];
        return {
          ...entry,
          monthData: {
            ...entry.monthData,
            [month]: { ...currentData, actual: parsedVal }
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
      const idsToDelete: string[] = [];
      
      entries.forEach(entry => {
        Object.entries(entry.monthData).forEach(([month, data]: [string, any]) => {
          if (dirtyCells.has(`${entry.id}-${month}`)) {
            const existingId = data.record_id;
            const amountValue = (data.actual === '' || data.actual === undefined || data.actual === null) ? null : Number(data.actual);
            const targetValue = Number(data.target) || 0;
            
            if (existingId && String(existingId).length > 5) {
              const updatePromise = supabase
                .from('Sales_database')
                .update({ 
                  actual_amount: amountValue,
                  target_amount: targetValue
                })
                .eq('id', existingId);
              updatePromises.push(updatePromise);

              // Gather duplicate IDs to delete
              const allIds = data.all_record_ids || [];
              const duplicates = allIds.filter((id: string) => id !== existingId && id && String(id).length > 5);
              idsToDelete.push(...duplicates);
            } else {
              const insertPromise = supabase
                .from('Sales_database')
                .insert({
                  customer_name: entry.customer_name,
                  Unit_name: entry.unit,
                  month: month,
                  year: currentFilters.year,
                  actual_amount: amountValue,
                  target_amount: targetValue,
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

      if (idsToDelete.length > 0) {
        const { error: delError } = await supabase
          .from('Sales_database')
          .delete()
          .in('id', idsToDelete);
        if (delError) console.error('Error cleaning up actual duplicates:', delError);
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
    return acc + Object.values(e.monthData).reduce((sum: number, m: any) => sum + (Number(m.target) || 0), 0);
  }, 0);

  const aggregateActual = entries.reduce((acc, e) => {
    return acc + Object.values(e.monthData).reduce((sum: number, m: any) => {
      const val = m.actual === '' || m.actual === undefined || m.actual === null ? 0 : Number(m.actual);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, 0);

  const totalGap = (aggregateActual - totalPlanned);

  return (
    <div className="space-y-4 animate-in fade-in duration-700">
      <header className="flex items-center justify-between bg-black text-white py-3 px-5 rounded-2xl shadow-xl shadow-black/10">
        <div className="flex items-center gap-3.5">
          <div className="p-2 bg-white/10 rounded-xl">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black italic tracking-tighter leading-tight">Monthly Pipeline Entry</h2>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Fiscal Cycle: {currentFilters.year}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={loading} className="bg-white text-black hover:bg-zinc-200 px-4 h-9 text-xs font-black gap-1.5 rounded-lg">
            <Save className="h-3.5 w-3.5" />
            {loading ? 'COMMITTING...' : 'COMMIT UPDATES'}
          </Button>
        </div>
      </header>

      {/* Master Filters - NEW */}
      <Card className="rounded-2xl border-none shadow-sm bg-white border border-zinc-100">
        <CardContent className="p-2.5">
          <div className="flex flex-col md:flex-row md:flex-wrap lg:flex-nowrap items-stretch md:items-end gap-2.5">
            {(user.role === 'Admin' || user.role === 'Branch Head') && (
              <div className="space-y-1 flex-1 min-w-[130px] md:max-w-[200px]">
                <label className="text-[9px] font-black uppercase text-zinc-500 px-1">Branch Context</label>
                <select 
                  className="w-full h-9 px-3 text-xs bg-zinc-50 border border-zinc-150 rounded-lg outline-none focus:ring-1 focus:ring-black appearance-none font-bold"
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

            <div className="space-y-1 flex-1 min-w-[130px] md:max-w-[180px]">
              <label className="text-[9px] font-black uppercase text-zinc-500 px-1">Unit Type</label>
              <select 
                className="w-full h-9 px-3 text-xs bg-zinc-50 border border-zinc-150 rounded-lg outline-none focus:ring-1 focus:ring-black appearance-none font-bold"
                value={currentFilters.unit}
                onChange={e => updateFilters({...currentFilters, unit: e.target.value})}
              >
                <option value="All">All Units</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div className="space-y-1 flex-1 min-w-[100px] md:max-w-[120px]">
              <label className="text-[9px] font-black uppercase text-zinc-500 px-1">Fiscal Year</label>
              <select 
                className="w-full h-9 px-3 text-xs bg-zinc-50 border border-zinc-150 rounded-lg outline-none focus:ring-1 focus:ring-black appearance-none font-bold"
                value={currentFilters.year}
                onChange={e => updateFilters({...currentFilters, year: e.target.value})}
              >
                <option value="All">All Years</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {(user.role === 'Admin' || user.role === 'Branch Head') && (
              <div className="space-y-1 flex-1 min-w-[130px] md:max-w-[180px]">
                <label className="text-[9px] font-black uppercase text-zinc-500 px-1">Managed Staff</label>
                <select 
                  className="w-full h-9 px-3 text-xs bg-zinc-50 border border-zinc-150 rounded-lg outline-none focus:ring-1 focus:ring-black appearance-none font-bold"
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

            <div className="space-y-1 flex-1 min-w-[160px]">
              <label className="text-[9px] font-black uppercase text-zinc-500 px-1">Search Customer</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <Input 
                  placeholder="Filter entries..."
                  className="h-9 pl-9 text-xs bg-zinc-50 border-zinc-150 rounded-lg font-bold"
                  value={filters.customer || ''}
                  onChange={e => updateFilters({...filters, customer: e.target.value})}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-md overflow-hidden bg-white rounded-2xl border border-zinc-200/50">
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-320px)] border-b border-zinc-200">
             <table className="w-full border-collapse">
              <thead>
                <tr className="bg-zinc-100 border-b-2 border-zinc-200">
                  <th className="p-4 text-left text-xs font-black uppercase tracking-widest text-zinc-800 sticky left-0 top-0 bg-zinc-100 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-zinc-200/85 min-w-[240px] md:min-w-[280px]">
                    Entity Context
                  </th>
                  {MONTHS.map(month => (
                    <th key={month} className="p-4 text-center text-xs font-black uppercase tracking-wide min-w-[230px] text-zinc-800 sticky top-0 bg-zinc-100 z-20">
                      {month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {displayEntries.map((entry) => {
                  const computedMonthData = computeMonthDataForEntry(entry);
                  
                  return (
                    <tr key={entry.id} className="hover:bg-zinc-50/40 transition-colors group">
                      <td className="p-4 sticky left-0 bg-white shadow-[3px_0_12px_-5px_rgba(0,0,0,0.12)] z-10 border-r border-zinc-100 min-w-[240px] md:min-w-[280px]">
                        <p className="text-sm font-black text-black leading-tight mb-1">{entry.customer_name}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-extrabold text-zinc-500 flex items-center gap-1 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-150">
                            <AlertCircle className="h-2.5 w-2.5 text-zinc-400" /> {entry.unit}
                          </span>
                          <span className="text-[10px] font-black px-1.5 py-0.5 bg-black/5 text-zinc-700 rounded uppercase tracking-wide">
                            {employees.find(e => e.id === entry.salesperson_id || e.full_name === entry.salesperson_id)?.full_name || entry.salesperson_id || 'Unassigned'}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400 italic">@{entry.branch}</span>
                        </div>
                      </td>
                      
                      {MONTHS.map(month => {
                        const monthDataVal = computedMonthData[month];
                        const originalTarget = monthDataVal.target;
                        const totalTarget = monthDataVal.totalTarget;
                        const actualVal = monthDataVal.actual;
                        const gap = monthDataVal.gap;
                        const carryForward = monthDataVal.carryForward;
                        const hasActual = actualVal !== undefined && actualVal !== null && actualVal !== '' && Number(actualVal) > 0;
                        
                        return (
                          <td key={month} className="p-4 transition-all border-x border-zinc-50 bg-white hover:bg-zinc-50/10">
                            <div className="space-y-3.5">
                              {/* Target Values Block - Bold, Professional, Clean */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 border border-zinc-200 rounded-lg">
                                  <span className="text-[9px] font-black text-zinc-700 uppercase tracking-wider">Target Value</span>
                                  <span className="text-[11px] font-black text-zinc-950 tabular-nums">{formatCurrency(originalTarget)}</span>
                                </div>
                                <div className={cn(
                                  "flex items-center justify-between px-3 py-1.5 rounded-lg border transition-colors",
                                  carryForward < 0 
                                    ? "bg-amber-100 border-amber-300 text-amber-950" 
                                    : carryForward > 0 
                                      ? "bg-sky-100 border-sky-300 text-sky-950"
                                      : "bg-zinc-50 border-zinc-200/50 text-zinc-500"
                                )}>
                                  <span className="text-[9px] font-black uppercase tracking-wider">Total Target</span>
                                  <span className={cn(
                                    "text-[11px] font-black tabular-nums",
                                    carryForward < 0 ? "text-amber-900" : carryForward > 0 ? "text-sky-900" : "text-zinc-650"
                                  )}>
                                    {formatCurrency(totalTarget)}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Input Box Block - Highlight in yellow when actual amount entered */}
                              <div className="relative group/input pt-1.5">
                                <label className={cn(
                                  "absolute -top-1 left-2 px-1.5 py-0.5 text-[8px] font-black uppercase z-10 rounded-md transition-colors border shadow-sm tracking-wider",
                                  hasActual 
                                    ? "bg-yellow-300 border-yellow-500 text-yellow-950" 
                                    : "bg-zinc-100 border-zinc-300 text-zinc-600"
                                )}>
                                  Actual Amount
                                </label>
                                <ActualCellInput 
                                  value={actualVal}
                                  placeholder={formatCurrency(totalTarget)}
                                  hasActual={hasActual}
                                  onChange={val => updateActual(entry.id, month, val)}
                                />
                              </div>
                              
                              {/* Gap Block - Highly styled, bold values */}
                              <div className={cn(
                                "flex items-center justify-between px-3 py-1.5 rounded-lg border",
                                gap > 0 
                                  ? "bg-emerald-50 border-emerald-300 text-emerald-950 font-black" 
                                  : gap < 0 
                                    ? "bg-rose-50 border-rose-300 text-rose-950 font-black" 
                                    : "bg-zinc-50 border-zinc-200 text-zinc-500"
                              )}>
                                <span className="text-[10px] font-black uppercase tracking-wider">GAP</span>
                                <span className={cn(
                                  "text-[11px] font-extrabold tabular-nums",
                                  gap > 0 ? "text-emerald-700 font-black" : (gap < 0 ? "text-rose-600 font-black animate-pulse" : "text-zinc-650")
                                )}>
                                  {gap > 0 ? `+${formatCurrency(gap)}` : (gap < 0 ? `-${formatCurrency(Math.abs(gap))}` : formatCurrency(0))}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-zinc-950 text-white py-2 px-5 rounded-xl border border-zinc-900 shadow-lg">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase text-zinc-500 tracking-wider">Total Planned:</span>
              <span className="text-xs font-black tracking-tight text-white tabular-nums">{formatCurrency(totalPlanned)}</span>
            </div>
            <div className="hidden sm:block h-3 w-[1px] bg-zinc-800" />
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase text-zinc-500 tracking-wider">Aggregate Actual:</span>
              <span className="text-xs font-black tracking-tight text-white tabular-nums">{formatCurrency(aggregateActual)}</span>
            </div>
            <div className="hidden sm:block h-3 w-[1px] bg-zinc-800" />
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase text-zinc-500 tracking-wider">Target Achieved:</span>
              <span className={cn(
                "text-xs font-black tracking-tight tabular-nums",
                totalPlanned > 0 && aggregateActual >= totalPlanned ? "text-emerald-400" : "text-amber-400"
              )}>
                {totalPlanned > 0 ? ((aggregateActual / totalPlanned) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-right">
            <span className="text-[8px] font-black uppercase text-zinc-500 tracking-wider">Gap:</span>
            <span className={cn(
              "text-xs font-black tracking-tight tabular-nums",
              totalGap < 0 ? "text-red-400" : "text-emerald-400"
            )}>
              {totalGap > 0 ? `+${formatCurrency(totalGap)}` : (totalGap < 0 ? `-${formatCurrency(Math.abs(totalGap))}` : formatCurrency(0))}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

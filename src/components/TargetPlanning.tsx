import React, { useState, useEffect } from 'react';
import { Plus, Save, Trash2, HelpCircle, Search, Filter, Layers, X, Check } from 'lucide-react';
import { Card, CardContent, Button, Input, Label } from '@/src/components/ui';
import { BRANCHES, UNITS, YEARS, MONTHS } from '@/src/constants';
import { Profile, Target } from '@/src/types';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { supabase } from '@/src/lib/supabase';

interface TargetPlanningProps {
  user: Profile;
  rows: TargetRow[];
  setRows: React.Dispatch<React.SetStateAction<TargetRow[]>>;
  filters: any;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
}

interface MonthlyTarget {
  [month: string]: number;
}

interface TargetRow {
  id: string;
  customer_name: string;
  branch: string;
  unit: string;
  year: string;
  monthly_targets: MonthlyTarget;
  monthly_units: MonthlyTarget;
  record_ids?: Record<string, string>;
  salesperson_id: string;
}

export default function TargetPlanning({ user, rows, setRows, filters, setFilters }: TargetPlanningProps) {
  const [employees, setEmployees] = useState<Profile[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  
  // Use persistent filters or initialize defaults
  const currentFilters = filters || {
    branch: user.role === 'Admin' ? 'All' : (user.branch_ids[0] || BRANCHES[0]),
    unit: 'All',
    year: YEARS[2], // 2026-2027
    employee: user.role === 'Sales Person' ? user.id : 'All'
  };

  const updateFilters = (newFilters: any) => {
    setFilters(newFilters);
  };
  
  // Bulk Entry State
  const [bulkData, setBulkData] = useState({
    customer: '',
    selectedMonths: [] as string[],
    unitValues: UNITS.reduce((acc, u) => ({ ...acc, [u]: 0 }), {}) as Record<string, number>,
    targetBranch: user.role === 'Admin' ? BRANCHES[0] : (user.branch_ids[0] || BRANCHES[0]),
    targetSalesperson: user.id
  });

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

  const fetchData = async () => {
    if (!currentFilters.year) return;
    setLoading(true);
    try {
      let query = supabase.from('Sales_database').select('*');
      
      // Filter based on currently active viewing filters
      if (currentFilters.branch !== 'All') query = query.eq('branch_id', currentFilters.branch);
      if (currentFilters.unit !== 'All') query = query.eq('Unit_name', currentFilters.unit);
      if (currentFilters.year) query = query.eq('year', currentFilters.year);
      if (currentFilters.employee !== 'All') query = query.eq('salesperson_id', currentFilters.employee);

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const groupedRows: Record<string, TargetRow> = {};
        
        data.forEach(record => {
          // Key by customer, unit, and salesperson to ensure distinct rows for different assignments
          const key = `${record.customer_name}-${record.Unit_name}-${record.salesperson_id}`;
          if (!groupedRows[key]) {
            groupedRows[key] = {
              id: key,
              customer_name: record.customer_name,
              branch: record.branch_id,
              unit: record.Unit_name,
              year: record.year,
              monthly_targets: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
              monthly_units: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
              record_ids: {},
              salesperson_id: record.salesperson_id
            };
          }
          groupedRows[key].monthly_targets[record.month] = Number(record.target_amount) || 0;
          groupedRows[key].monthly_units[record.month] = Number(record.target_unit) || 0;
          if (!groupedRows[key].record_ids) groupedRows[key].record_ids = {};
          groupedRows[key].record_ids[record.month] = record.id;
        });

        setRows(Object.values(groupedRows));
      } else {
        setRows([]);
      }
    } catch (error) {
      console.error('Fetch Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [currentFilters.branch]);

  useEffect(() => {
    // If we're coming back to the tab, only fetch if we don't have rows
    if (rows.length === 0 || !filters) {
      fetchData();
    }
    // Initialize filters in App.tsx if they don't exist
    if (!filters) {
      setFilters(currentFilters);
    }
  }, [filters]); 

  const addRow = () => {
    setRows([...rows, { 
      id: Math.random().toString(36).substr(2, 9),
      customer_name: '', 
      branch: currentFilters.branch === 'All' ? (user.branch_ids[0] || BRANCHES[0]) : currentFilters.branch, 
      unit: currentFilters.unit === 'All' ? UNITS[0] : currentFilters.unit, 
      year: currentFilters.year,
      monthly_targets: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
      monthly_units: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
      record_ids: {},
      salesperson_id: currentFilters.employee === 'All' ? user.id : currentFilters.employee
    }]);
  };

  const removeRow = async (rowIndex: number) => {
    const row = rows[rowIndex];
    const idsToDelete = Object.values(row.record_ids || {});
    
    if (idsToDelete.length > 0) {
      const { error } = await supabase.from('Sales_database').delete().in('id', idsToDelete);
      if (error) {
        toast.error('Delete failed');
        return;
      }
    }
    setRows(rows.filter((_, i) => i !== rowIndex));
  };

  const updateRowField = (id: string, field: keyof TargetRow, value: any) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const updateMonthlyValue = (rowId: string, month: string, value: number, field: 'amt' | 'unit') => {
    setRows(rows.map(r => {
      if (r.id === rowId) {
        if (field === 'amt') {
          return {
            ...r,
            monthly_targets: { ...r.monthly_targets, [month]: value }
          };
        } else {
          return {
            ...r,
            monthly_units: { ...r.monthly_units, [month]: value }
          };
        }
      }
      return r;
    }));
  };

  const handleSave = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    try {
      const recordsToUpsert: any[] = [];
      
      rows.forEach(r => {
        r.customer_name = r.customer_name.trim();
        MONTHS.forEach(m => {
          const val = r.monthly_targets[m];
          const unitCount = r.monthly_units[m];
          
          const payload: any = {
            customer_name: r.customer_name,
            Unit_name: r.unit,
            month: m,
            year: r.year || currentFilters.year,
            target_amount: val,
            target_unit: unitCount,
            branch_id: r.branch,
            salesperson_id: r.salesperson_id
          };
          
          const existingId = r.record_ids?.[m];
          if (existingId && existingId !== 'null' && existingId !== 'undefined' && String(existingId).length > 5) {
            payload.id = existingId;
          }
          
          // Only push if there is actual target value or we are specifically updating an existing record
          if (val > 0 || unitCount > 0 || (payload.id)) {
            recordsToUpsert.push(payload);
          }
        });
      });

      if (recordsToUpsert.length > 0) {
        // Separate inserts and updates to avoid "null value in column id" errors with mixed upserts
        const inserts = recordsToUpsert.filter(r => !r.id);
        const updates = recordsToUpsert.filter(r => r.id);

        if (inserts.length > 0) {
          const { error: insError } = await supabase.from('Sales_database').insert(inserts);
          if (insError) throw insError;
        }
        
        if (updates.length > 0) {
          const { error: upsError } = await supabase.from('Sales_database').upsert(updates, { onConflict: 'id' });
          if (upsError) throw upsError;
        }
      }

      toast.success('Targets committed to Sales Database');
      fetchData();
    } catch (error) {
      console.error('Save Error:', error);
      toast.error(`Save Error: ${error instanceof Error ? error.message : 'Check database connectivity'}`);
    } finally {
      setLoading(false);
    }
  };

  const applyBulkEntry = () => {
    if (!bulkData.customer || bulkData.selectedMonths.length === 0) {
      toast.error('Customer and at least one month must be selected');
      return;
    }

    const newRows: TargetRow[] = [];
    
    Object.entries(bulkData.unitValues).forEach(([unit, val]) => {
      const value = val as number;
      if (value > 0) {
        const newRow: TargetRow = {
          id: Math.random().toString(36).substr(2, 9),
          customer_name: bulkData.customer,
          branch: bulkData.targetBranch,
          unit: unit,
          year: currentFilters.year,
          monthly_targets: MONTHS.reduce((acc, m) => ({
            ...acc,
            [m]: bulkData.selectedMonths.includes(m) ? value : 0
          }), {}),
          monthly_units: MONTHS.reduce((acc, m) => ({
            ...acc,
            [m]: 0 
          }), {}),
          record_ids: {},
          salesperson_id: bulkData.targetSalesperson
        };
        newRows.push(newRow);
      }
    });

    if (newRows.length === 0) {
      toast.error('Enter at least one unit value');
      return;
    }

    setRows([...rows, ...newRows]);
    setShowBulkEntry(false);
    setBulkData({
      customer: '',
      selectedMonths: [],
      unitValues: UNITS.reduce((acc, u) => ({ ...acc, [u]: 0 }), {}),
      targetBranch: user.role === 'Admin' ? BRANCHES[0] : (user.branch_ids[0] || BRANCHES[0]),
      targetSalesperson: user.id
    });
    toast.success(`${newRows.length} units added for ${bulkData.customer}. Click "SAVE CHANGES" to finalize.`);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black italic tracking-tighter">Target Planning</h2>
          <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">Master Grid Entry - FY {currentFilters.year}</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowBulkEntry(true)}
            className="gap-2 border-black border-2 text-black font-black"
          >
            <Layers className="h-4 w-4" />
            BULK ENTRY
          </Button>
          <Button onClick={handleSave} disabled={loading} className="gap-2 bg-black text-white px-8 font-black focus:ring-2 focus:ring-offset-2 focus:ring-black">
            <Save className="h-4 w-4" />
            {loading ? 'SAVING...' : 'SAVE CHANGES'}
          </Button>
        </div>
      </header>

      {/* Master Filters */}
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
                  disabled={user.role !== 'Admin'}
                >
                  <option value="All">All Branches</option>
                  {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
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
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Fiscal Year</label>
              <select 
                className="w-full h-10 px-3 text-xs bg-zinc-50 border border-zinc-100 rounded-xl outline-none focus:ring-1 focus:ring-black appearance-none font-bold"
                value={currentFilters.year}
                onChange={e => updateFilters({...currentFilters, year: e.target.value})}
              >
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
                    .filter(e => currentFilters.branch === 'All' || e.branch_ids?.includes(currentFilters.branch))
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.role})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grid Planning Table */}
      <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-zinc-900 text-white">
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-widest sticky left-0 bg-zinc-900 z-10 w-12 text-center">#</th>
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-widest min-w-[200px]">Customer Name</th>
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-widest min-w-[120px]">Unit</th>
                  {MONTHS.map(m => (
                    <th key={m} className="p-4 text-center text-[10px] font-black uppercase tracking-widest min-w-[140px]">
                      {m.substring(0, 3)}
                    </th>
                  ))}
                  <th className="p-4 text-center text-[10px] font-black uppercase tracking-widest">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row, index) => (
                  <tr key={row.id} className="hover:bg-zinc-50 transition-colors group">
                    <td className="p-4 text-xs font-black text-zinc-300 sticky left-0 bg-white group-hover:bg-zinc-50 z-10 text-center">{index + 1}</td>
                    <td className="p-4">
                      <Input 
                        placeholder="Customer..." 
                        className="h-9 text-xs font-black border-none bg-zinc-50/50 rounded-lg px-2 focus-visible:ring-1 focus-visible:ring-black"
                        value={row.customer_name}
                        spellCheck={false}
                        data-gramm="false"
                        onChange={e => updateRowField(row.id, 'customer_name', e.target.value)}
                      />
                    </td>
                    <td className="p-4">
                      <select 
                        className="w-full h-9 px-2 text-[10px] font-black uppercase text-zinc-600 bg-zinc-100 rounded-lg border-none outline-none appearance-none cursor-pointer"
                        value={row.unit}
                        onChange={e => updateRowField(row.id, 'unit', e.target.value)}
                      >
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    {MONTHS.map(m => (
                      <td key={m} className="p-2 border-x border-zinc-50">
                        <div className="space-y-1">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-zinc-300 uppercase self-start leading-none mb-0.5">Value</span>
                            <input 
                              type="number"
                              className="w-full text-[11px] font-bold text-center border-b border-zinc-100 group-hover:border-zinc-300 bg-transparent focus:border-black focus:ring-0 outline-none tabular-nums h-6"
                              value={row.monthly_targets[m]}
                              spellCheck={false}
                              data-gramm="false"
                              onChange={e => updateMonthlyValue(row.id, m, parseInt(e.target.value) || 0, 'amt')}
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-zinc-300 uppercase self-start leading-none mb-0.5">Qty</span>
                            <input 
                              type="number"
                              className="w-full text-[10px] font-medium text-center border-b border-zinc-50 group-hover:border-zinc-200 bg-transparent focus:border-zinc-400 focus:ring-0 outline-none tabular-nums h-5 italic"
                              value={row.monthly_units[m]}
                              spellCheck={false}
                              data-gramm="false"
                              onChange={e => updateMonthlyValue(row.id, m, parseInt(e.target.value) || 0, 'unit')}
                            />
                          </div>
                        </div>
                      </td>
                    ))}
                    <td className="p-4 text-center">
                      <button onClick={() => removeRow(index)} className="text-zinc-300 hover:text-red-500 transition-colors bg-zinc-50 h-8 w-8 rounded-full flex items-center justify-center mx-auto">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-zinc-50/20">
            <Button 
              variant="outline" 
              className="w-full border-dashed border-zinc-300 h-14 rounded-2xl text-zinc-500 font-bold hover:bg-white hover:text-black transition-all"
              onClick={addRow}
            >
              <Plus className="h-4 w-4 mr-2" />
              ADD INDIVIDUAL TARGET ROW
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Entry Overlay */}
      {showBulkEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border border-white/20">
            <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div>
                <h3 className="text-2xl font-black italic tracking-tighter">Bulk Target Setup</h3>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Fiscal Year: {currentFilters.year}</p>
              </div>
              <button onClick={() => setShowBulkEntry(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-zinc-200 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-h-[60vh] overflow-y-auto">
              {/* Left Side: Setup */}
              <div className="space-y-6">
                {(user.role === 'Admin' || user.role === 'Branch Head') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Context Branch</Label>
                      <select 
                        className="w-full h-12 px-3 text-xs bg-zinc-50 border border-zinc-200 rounded-2xl font-bold"
                        value={bulkData.targetBranch}
                        onChange={e => setBulkData({...bulkData, targetBranch: e.target.value})}
                        disabled={user.role !== 'Admin'}
                      >
                        {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Assign To</Label>
                      <select 
                        className="w-full h-12 px-3 text-xs bg-zinc-50 border border-zinc-200 rounded-2xl font-bold"
                        value={bulkData.targetSalesperson}
                        onChange={e => setBulkData({...bulkData, targetSalesperson: e.target.value})}
                      >
                        {employees
                          .filter(e => bulkData.targetBranch === 'All' || e.branch_ids?.includes(bulkData.targetBranch))
                          .map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                          ))
                        }
                      </select>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Customer Identifier</Label>
                  <Input 
                    placeholder="ENTER CUSTOMER..." 
                    className="h-14 text-lg font-black border-zinc-200 rounded-2xl focus:ring-black"
                    value={bulkData.customer}
                    spellCheck={false}
                    data-gramm="false"
                    onChange={e => setBulkData({...bulkData, customer: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Select Active Months</Label>
                    <button 
                      className="text-[10px] font-black text-black underline hover:text-zinc-600"
                      onClick={() => setBulkData({...bulkData, selectedMonths: bulkData.selectedMonths.length === MONTHS.length ? [] : MONTHS})}
                    >
                      {bulkData.selectedMonths.length === MONTHS.length ? 'NONE' : 'ALL'}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    {MONTHS.map(m => (
                      <button
                        key={m}
                        onClick={() => setBulkData({
                          ...bulkData,
                          selectedMonths: bulkData.selectedMonths.includes(m) 
                            ? bulkData.selectedMonths.filter(sm => sm !== m)
                            : [...bulkData.selectedMonths, m]
                        })}
                        className={cn(
                          "px-2 py-2 rounded-xl text-[9px] font-black uppercase transition-all flex items-center justify-center",
                          bulkData.selectedMonths.includes(m)
                            ? "bg-black text-white shadow-lg"
                            : "bg-white text-zinc-400 border border-zinc-200 hover:border-zinc-400"
                        )}
                      >
                        {m.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Side: Units */}
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Unit Wise Projections (INR)</Label>
                <div className="grid grid-cols-2 gap-3 bg-zinc-50 p-4 rounded-3xl border border-zinc-100 max-h-[300px] overflow-y-auto">
                  {UNITS.map(unit => (
                    <div key={unit} className="bg-white p-3 rounded-xl shadow-sm border border-zinc-100 focus-within:ring-1 focus-within:ring-black transition-all">
                      <p className="text-[9px] font-black uppercase text-zinc-400 mb-1">{unit}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-300 font-bold text-xs">₹</span>
                        <input 
                          type="number"
                          className="w-full text-sm font-black outline-none border-none p-0 tabular-nums bg-transparent"
                          placeholder="0"
                          value={bulkData.unitValues[unit] || ''}
                          onChange={e => setBulkData({
                            ...bulkData,
                            unitValues: { ...bulkData.unitValues, [unit]: parseInt(e.target.value) || 0 }
                          })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-8 bg-zinc-50 border-t border-zinc-100 flex gap-4">
              <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black text-zinc-400 hover:text-black" onClick={() => setShowBulkEntry(false)}>
                DISCARD
              </Button>
              <Button className="flex-[2] h-14 rounded-2xl font-black text-lg gap-3 bg-black hover:scale-[1.02] transition-transform" onClick={applyBulkEntry}>
                <Check className="h-5 w-5" />
                ADD TO GRID
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

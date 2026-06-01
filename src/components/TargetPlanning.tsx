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
  monthly_actuals?: MonthlyTarget;
  record_ids?: Record<string, string>;
  all_record_ids?: Record<string, string[]>;
  salesperson_id: string;
}

export default function TargetPlanning({ user, rows, setRows, filters, setFilters }: TargetPlanningProps) {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [filterMetadata, setFilterMetadata] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  
  // Dashboard filters
  const currentFilters = filters;

  const downloadCSV = () => {
    const tableHeader = [`Sr.No`, `Branch Name`, `Employee Name`, `Customer Name`, `Unit`, ...MONTHS, `Total`];

    const csvRows = [
      tableHeader.join(',')
    ];

    displayRows.forEach((row, index) => {
      const matchingEmp = employees.find(e => e.id === row.salesperson_id || e.full_name === row.salesperson_id);
      const employeeName = matchingEmp?.full_name || row.salesperson_id || 'Unknown';
      const branchName = row.branch || 'Unknown';

      const total = MONTHS.reduce((sum, m) => sum + (row.monthly_targets[m] || 0), 0);
      const csvRow = [
        index + 1,
        `"${branchName}"`,
        `"${employeeName}"`,
        `"${row.customer_name}"`,
        `"${row.unit}"`,
        ...MONTHS.map(m => row.monthly_targets[m] || 0),
        total
      ];
      csvRows.push(csvRow.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Target_Planning_${currentFilters.year}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const updateFilters = (newFilters: any) => {
    setFilters(newFilters);
  };
  
  // Keep track of the initial loaded records to compare and only update values that actually changed
  const [initialRows, setInitialRows] = useState<any[]>([]);

  // Derived state for display rows with search filtering
  const displayRows = rows.filter(r => 
    (r.customer_name || '').toLowerCase().includes((filters.customer || '').toLowerCase())
  );
  
  // Bulk Entry State
  const [bulkData, setBulkData] = useState({
    customer: '',
    selectedMonths: [] as string[],
    unitValues: UNITS.reduce((acc, u) => ({ ...acc, [u]: 0 }), {}) as Record<string, number>,
    targetBranch: user.role === 'Admin' ? 'All' : (user.branch_ids[0] || BRANCHES[0]),
    targetSalesperson: 'All'
  });

  // Sync bulk salesperson with filter if it changes
  useEffect(() => {
    setBulkData(prev => ({
      ...prev,
      targetSalesperson: currentFilters.employee,
      targetBranch: currentFilters.branch
    }));
  }, [currentFilters.employee, currentFilters.branch, showBulkEntry]);

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
    if (!currentFilters.year) return;
    setLoading(true);
    try {
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase.from('Sales_database').select('*').range(page * pageSize, (page + 1) * pageSize - 1);
        
        // Filter based on currently active viewing filters
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
          allData = [...allData, ...pageData];
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

      const groupedRows: Record<string, TargetRow> = {};
      
      allData.forEach(record => {
          // Normalize legacy name records to actual UUIDs if possible for UI dropdown compatibility
          let sid = record.salesperson_id;
          const matchingEmp = employees.find(e => e.id === sid || e.full_name === sid);
          if (matchingEmp) sid = matchingEmp.id;

          // Normalize branch_id for grouping
          const displayBranch = record.branch_id === 'Banglore' ? 'Bangalore' : record.branch_id;

          // Key by customer, unit, salesperson, and branch to ensure distinct rows for different assignments
          const key = `${record.customer_name}-${record.Unit_name}-${sid}-${displayBranch}`;
          if (!groupedRows[key]) {
            groupedRows[key] = {
              id: key,
              customer_name: record.customer_name,
              branch: displayBranch,
              unit: record.Unit_name,
              year: record.year,
              monthly_targets: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
              monthly_actuals: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
              record_ids: {},
              all_record_ids: {},
              salesperson_id: sid
            };
          }
          groupedRows[key].monthly_targets[record.month] = (groupedRows[key].monthly_targets[record.month] || 0) + (Number(record.target_amount) || 0);
          if (groupedRows[key].monthly_actuals) {
            groupedRows[key].monthly_actuals[record.month] = (groupedRows[key].monthly_actuals[record.month] || 0) + (Number(record.actual_amount) || 0);
          }
          if (!groupedRows[key].record_ids) groupedRows[key].record_ids = {};
          if (!groupedRows[key].record_ids[record.month]) {
            groupedRows[key].record_ids[record.month] = record.id;
          }
          if (!groupedRows[key].all_record_ids) groupedRows[key].all_record_ids = {};
          if (!groupedRows[key].all_record_ids[record.month]) {
            groupedRows[key].all_record_ids[record.month] = [];
          }
          groupedRows[key].all_record_ids[record.month].push(record.id);
        });

        // Sort rows by customer name alphabetically
        const finalRows = Object.values(groupedRows).sort((a: any, b: any) => 
          (a.customer_name || '').localeCompare(b.customer_name || '')
        );
        
        setRows(finalRows);
        setInitialRows(JSON.parse(JSON.stringify(finalRows)));

        // Cascading Units
        if (currentFilters.unit === 'All') {
          const unitsWithData = Array.from(new Set(allData.map(s => s.Unit_name))).filter(Boolean) as string[];
          if (unitsWithData.length > 0) setAvailableUnits(unitsWithData.sort());
        } else if (currentFilters.branch === 'All' && currentFilters.employee === 'All') {
          setAvailableUnits(UNITS);
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
  }, []);

  useEffect(() => {
    // fetchData will run when filters or employees change (excluding search filters to preserve dirty edits)
    fetchData();
  }, [filters.branch, filters.unit, filters.year, filters.employee, employees]); 

  const addRow = () => {
    setRows([...rows, { 
      id: Math.random().toString(36).substr(2, 9),
      customer_name: '', 
      branch: currentFilters.branch === 'All' ? (user.branch_ids[0] || BRANCHES[0]) : currentFilters.branch, 
      unit: currentFilters.unit === 'All' ? UNITS[0] : currentFilters.unit, 
      year: currentFilters.year,
      monthly_targets: MONTHS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {}),
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

  const updateMonthlyValue = (rowId: string, month: string, valueStr: string) => {
    const val = valueStr === '' ? '' : (parseInt(valueStr) || 0);
    setRows(rows.map(r => {
      if (r.id === rowId) {
        return {
          ...r,
          monthly_targets: { ...r.monthly_targets, [month]: val }
        };
      }
      return r;
    }));
  };

  const handleReassign = async (rowId: string, newSalespersonId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    setLoading(true);
    try {
      const recordIds = Object.values(row.record_ids || {}).filter(id => id && String(id).length > 5);
      
      if (recordIds.length > 0) {
        const { error } = await supabase
          .from('Sales_database')
          .update({ salesperson_id: newSalespersonId })
          .in('id', recordIds);

        if (error) throw error;
        toast.success('Salesperson updated successfully');
      }
      
      // Update local state too
      updateRowField(rowId, 'salesperson_id', newSalespersonId);
      
      // If records were updated, we might want to refetch to ensure consistency, 
      // but updating the row locally is smoother. 
      // However, if the filter is active, the row might disappear if it no longer matches.
      if (currentFilters.employee !== 'All') {
        fetchData();
      }
    } catch (err) {
      console.error('Reassign error:', err);
      toast.error('Failed to update salesperson');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    try {
      const recordsToUpsert: any[] = [];
      const idsToDelete: string[] = [];
      
      rows.forEach(r => {
        r.customer_name = (r.customer_name || '').trim();
        const initialRow = initialRows.find(ir => ir.id === r.id);

        // Checks if metadata (row key identifiers) changed
        const hasMetaChanged = !initialRow || 
          initialRow.customer_name !== r.customer_name ||
          initialRow.unit !== r.unit ||
          initialRow.salesperson_id !== r.salesperson_id ||
          initialRow.branch !== r.branch;

        MONTHS.forEach(m => {
          const rawVal = r.monthly_targets[m];
          const val = (rawVal as any) === '' ? 0 : (Number(rawVal) || 0);
          
          const initialRawVal = initialRow?.monthly_targets?.[m];
          const initialVal = (initialRawVal as any) === '' ? 0 : (Number(initialRawVal) || 0);

          // We only update if the metadata (customer, unit, salesperson, branch) has changed,
          // OR if the target value for this month has changed compared to initial load.
          const isModified = hasMetaChanged || val !== initialVal;

          const existingId = r.record_ids?.[m];

          if (isModified) {
            const payload: any = {
              customer_name: r.customer_name,
              Unit_name: r.unit,
              month: m,
              year: r.year || currentFilters.year,
              target_amount: val,
              actual_amount: r.monthly_actuals?.[m] || 0,
              branch_id: r.branch,
              salesperson_id: r.salesperson_id
            };
            
            if (existingId && existingId !== 'null' && existingId !== 'undefined' && String(existingId).length > 5) {
              payload.id = existingId;
            }
            
            // Only push if there is actual target value or we are specifically updating/clearing an existing record
            if (val > 0 || payload.id) {
              recordsToUpsert.push(payload);
            }
          }

          // Gather target duplicates to clean up if we have them
          if (existingId) {
            const allIds = r.all_record_ids?.[m] || [];
            const duplicates = allIds.filter((id: string) => id !== existingId && id && String(id).length > 5);
            idsToDelete.push(...duplicates);
          }
        });
      });

      // Internal helper to limit concurrent HTTP connections
      const executeInBatches = async (tasks: (() => Promise<any>)[], batchSize = 15) => {
        const results = [];
        for (let i = 0; i < tasks.length; i += batchSize) {
          const batch = tasks.slice(i, i + batchSize);
          const batchResults = await Promise.all(batch.map(fn => fn()));
          results.push(...batchResults);
        }
        return results;
      };

      if (recordsToUpsert.length > 0) {
        // Separate inserts and updates to avoid "null value in column id" errors with mixed upserts
        const inserts = recordsToUpsert.filter(r => !r.id);
        const updates = recordsToUpsert.filter(r => r.id);

        if (inserts.length > 0) {
          const { error: insError } = await supabase.from('Sales_database').insert(inserts);
          if (insError) throw insError;
        }
        
        if (updates.length > 0) {
          const updateTasks = updates.map((record: any) => {
            return async () => {
              const { id, ...patch } = record;
              const updatePayload = {
                target_amount: patch.target_amount,
                actual_amount: patch.actual_amount,
                customer_name: patch.customer_name,
                Unit_name: patch.Unit_name,
                salesperson_id: patch.salesperson_id,
                branch_id: patch.branch_id
              };
              return supabase
                .from('Sales_database')
                .update(updatePayload)
                .eq('id', id);
            };
          });
          const results = await executeInBatches(updateTasks, 15);
          const failedResult = results.find(r => r.error);
          if (failedResult) throw failedResult.error;
        }
      }

      if (idsToDelete.length > 0) {
        const uniqueIdsToDelete = Array.from(new Set(idsToDelete));
        const deleteTasks = [];
        const batchSize = 100; // deletes can be larger batches
        for (let i = 0; i < uniqueIdsToDelete.length; i += batchSize) {
          const chunk = uniqueIdsToDelete.slice(i, i + batchSize);
          deleteTasks.push(async () => {
            return supabase
              .from('Sales_database')
              .delete()
              .in('id', chunk);
          });
        }
        const delResults = await executeInBatches(deleteTasks, 5);
        const failedDel = delResults.find(r => r.error);
        if (failedDel) console.error('Error cleaning up target duplicates:', failedDel.error);
      }

      toast.success('Targets committed to Sales Database successfully');
      fetchData();
    } catch (error: any) {
      console.error('Save Error:', error);
      const errMsg = error?.message || error?.details || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      toast.error(`Save Error: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const applyBulkEntry = () => {
    if (!bulkData.customer || bulkData.selectedMonths.length === 0) {
      toast.error('Customer and at least one month must be selected');
      return;
    }

    if (bulkData.targetBranch === 'All') {
      toast.error('Please select a specific branch for bulk entry');
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

    if (bulkData.targetSalesperson === 'All') {
      toast.error('Please assign target to a specific staff member');
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
          {user.role === 'Admin' && (
            <Button 
              variant="outline" 
              onClick={downloadCSV}
              className="gap-2 border-green-600 border-2 text-green-700 font-black hover:bg-green-50"
            >
              <Save className="h-4 w-4" />
              DATA DOWNLOAD CSV
            </Button>
          )}
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
                    const selectedEmp = employees.find(e => e.id === currentFilters.employee);
                    return filterMetadata.some(m => 
                      (currentFilters.branch === 'All' || m.branch_id === currentFilters.branch) &&
                      (currentFilters.employee === 'All' || m.salesperson_id === currentFilters.employee || 
                       selectedEmp?.full_name === m.salesperson_id) &&
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
                  placeholder="Filter by customer..."
                  className="h-10 pl-9 text-xs bg-zinc-50 border-zinc-100 rounded-xl font-bold"
                  value={filters.customer || ''}
                  onChange={e => updateFilters({...filters, customer: e.target.value})}
                />
              </div>
            </div>
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
                {displayRows.map((row, index) => (
                  <tr key={row.id} className="hover:bg-zinc-50 transition-colors group">
                    <td className="p-4 text-xs font-black text-zinc-300 sticky left-0 bg-white group-hover:bg-zinc-50 z-10 text-center">{index + 1}</td>
                    <td className="p-4">
                      <Input 
                        placeholder="Customer..." 
                        className="h-9 text-xs font-black border-none bg-zinc-50/50 rounded-lg px-2 focus-visible:ring-1 focus-visible:ring-black mb-1"
                        value={row.customer_name}
                        spellCheck={false}
                        data-gramm="false"
                        onChange={e => updateRowField(row.id, 'customer_name', e.target.value)}
                      />
                      <div className="flex flex-wrap items-center gap-1.5 px-2">
                        {(user.role === 'Admin' || user.role === 'Branch Head') ? (
                          <select 
                            className="text-[9px] font-black uppercase px-1 py-0.5 bg-zinc-100 text-zinc-600 rounded tracking-tighter border-none outline-none appearance-none cursor-pointer hover:bg-zinc-200 transition-colors"
                            value={row.salesperson_id}
                            onChange={e => updateRowField(row.id, 'salesperson_id', e.target.value)}
                          >
                            {/* Ensure current value is visible even if legacy name or not in branch */}
                            {!employees.some(e => e.id === row.salesperson_id) && (
                              <option value={row.salesperson_id}>{row.salesperson_id}</option>
                            )}
                            {employees
                              .filter(e => {
                                if (user.role === 'Admin') return e.branch_ids?.includes(row.branch);
                                // Branch head can only reassign within their permitted branches
                                return e.branch_ids?.includes(row.branch) && e.branch_ids?.some(bid => user.branch_ids?.includes(bid));
                              })
                              .map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                              ))
                            }
                          </select>
                        ) : (
                          <span className="text-[9px] font-black uppercase px-1 py-0.5 bg-zinc-100 text-zinc-500 rounded tracking-tighter">
                            {employees.find(e => e.id === row.salesperson_id || e.full_name === row.salesperson_id)?.full_name || row.salesperson_id || 'Unassigned'}
                          </span>
                        )}
                        <span className="text-[9px] font-bold text-zinc-300 italic">@{row.branch}</span>
                      </div>
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
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-zinc-300 uppercase self-start leading-none mb-0.5">Value</span>
                          <input 
                            type="number"
                            className="w-full text-[11px] font-bold text-center border-b border-zinc-100 group-hover:border-zinc-300 bg-transparent focus:border-black focus:ring-0 outline-none tabular-nums h-6"
                            value={row.monthly_targets[m] === undefined || row.monthly_targets[m] === null ? '' : row.monthly_targets[m]}
                            spellCheck={false}
                            data-gramm="false"
                            onChange={e => updateMonthlyValue(row.id, m, e.target.value)}
                          />
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
                        <option value="All" disabled>Select Staff...</option>
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

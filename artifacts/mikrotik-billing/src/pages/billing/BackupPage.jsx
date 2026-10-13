import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  HardDrive,
  Plus,
  Play,
  Download,
  Eye,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  X,
  Upload,
  RefreshCw,
  Calendar,
  Router,
  FileText,
} from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const API = import.meta.env.VITE_API_URL || "/api";

const EMPTY_FORM = {
  name: "",
  ip_address: "",
  api_port: 8728,
  username: "",
  schedule: "daily",
  time: "02:00",
};

const EMPTY_RESTORE = {
  target_ip: "",
  target_port: 8728,
  target_username: "",
  target_password: "",
};

export function BackupPage() {
  const toast = useToast();
  const [schedules, setSchedules] = useState([]);
  const [backups, setBackups] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [viewBackup, setViewBackup] = useState(null);
  const [running, setRunning] = useState(false);
  const [showRestore, setShowRestore] = useState(null);
  const [restoreForm, setRestoreForm] = useState(EMPTY_RESTORE);
  const [restoring, setRestoring] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchSchedules();
    fetchBackups();
  }, []);

  const fetchSchedules = async () => {
    try {
      const { data } = await axios.get(`${API}/advanced/backup/schedules`);
      setSchedules(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error("Failed to load schedules");
    }
  };

  const fetchBackups = async () => {
    try {
      const { data } = await axios.get(`${API}/advanced/backup/backups`);
      setBackups(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error("Failed to load backups");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/advanced/backup/schedules`, form);
      toast.success("Schedule created");
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchSchedules();
    } catch (error) {
      toast.error("Failed to create schedule");
    }
  };

  const runBackup = async (id) => {
    setRunning(true);
    try {
      await axios.post(`${API}/advanced/backup/schedules/${id}/run`);
      toast.success("Backup completed");
      fetchBackups();
      fetchSchedules();
    } catch (error) {
      toast.error("Backup failed");
    }
    setRunning(false);
  };

  const runAll = async () => {
    setRunning(true);
    try {
      const { data } = await axios.post(`${API}/advanced/backup/run-all`);
      toast.success(
        `Backups: ${data.success || 0} succeeded, ${data.failed || 0} failed`,
      );
      fetchBackups();
      fetchSchedules();
    } catch (error) {
      toast.error("Run all backups failed");
    }
    setRunning(false);
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm("Delete this backup schedule?")) {return;}
    try {
      await axios.delete(`${API}/advanced/backup/schedules/${id}`);
      toast.success("Schedule deleted");
      fetchSchedules();
    } catch (error) {
      toast.error("Failed to delete schedule");
    }
  };

  const viewBackupContent = async (id) => {
    try {
      const { data } = await axios.get(`${API}/advanced/backup/backups/${id}`);
      setViewBackup(data);
    } catch (error) {
      toast.error("Failed to load backup content");
    }
  };

  const downloadBackup = (backup) => {
    const content =
      backup.config_content ||
      `# Backup from ${backup.ip_address}\n# ${backup.created_at}\n# Content not available`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-${backup.device_name}-${backup.created_at.split("T")[0]}.rsc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (backup) => {
    setShowRestore(backup);
    setRestoreForm(EMPTY_RESTORE);
  };

  const executeRestore = async (e) => {
    e.preventDefault();
    setRestoring(true);
    try {
      await axios.post(
        `${API}/advanced/backup/restore/${showRestore.id}`,
        restoreForm,
      );
      toast.success("Backup restored");
      setShowRestore(null);
    } catch (error) {
      toast.error("Restore failed");
    }
    setRestoring(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {setUploadFile(file);}
  };

  const executeUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {return;}
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      await axios.post(`${API}/advanced/backup/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Backup file uploaded");
      setShowUpload(false);
      setUploadFile(null);
      fetchBackups();
    } catch (error) {
      toast.error("Upload failed");
    }
    setUploading(false);
  };

  const scheduleLabel = (s) => {
    switch (s) {
      case "daily":
        return "Daily";
      case "weekly":
        return "Weekly";
      case "monthly":
        return "Monthly";
      default:
        return s;
    }
  };

  const scheduleColor = (status) => {
    switch (status) {
      case "success":
        return "text-emerald-400";
      case "failed":
        return "text-red-400";
      default:
        return "text-zinc-500";
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-blue-400" />
            </div>
            Auto Backup & Restore
          </h1>
          <p className="text-zinc-400 mt-2 ml-13">
            Schedule automatic MikroTik config backups and restore when needed
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUpload(true)}
            className="gap-1.5"
          >
            <Upload className="w-4 h-4" /> Upload
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" /> New Schedule
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-2xl font-bold text-white">
            {schedules.length}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Active Schedules</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-2xl font-bold text-white">{backups.length}</div>
          <div className="text-xs text-zinc-500 mt-1">Total Backups</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={runAll}
            disabled={running}
            className="w-full gap-1.5 text-xs"
          >
            {running ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Run All Now
          </Button>
        </div>
      </div>

      {/* Schedules */}
      <Card className="border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-400" />
            Backup Schedules
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No backup schedules yet</p>
              <p className="text-xs mt-1">
                Create one to start automatic backups
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors bg-zinc-900/30"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${s.last_status === "success" ? "bg-emerald-500" : s.last_status === "failed" ? "bg-red-500" : "bg-zinc-600"}`}
                    />
                    <div>
                      <p className="text-white text-sm font-medium">
                        {s.name || s.device_name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {s.ip_address} • {scheduleLabel(s.schedule)} at{" "}
                        {s.time || "02:00"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runBackup(s.id)}
                      disabled={running}
                      className="text-zinc-400 hover:text-white"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSchedule(s.id)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backups History */}
      <Card className="border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-zinc-400" />
            Backup History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No backups yet</p>
              <p className="text-xs mt-1">
                Run a backup or upload a config file
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {backups.slice(0, 20).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {b.status === "success" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">
                        {b.device_name || b.name || "Unknown"}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {b.ip_address} •{" "}
                        {b.created_at
                          ? new Date(b.created_at).toLocaleString()
                          : ""}{" "}
                        •{" "}
                        {b.file_size
                          ? `${(b.file_size / 1024).toFixed(1)}KB`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => viewBackupContent(b.id)}
                      className="text-zinc-400 hover:text-white"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadBackup(b)}
                      className="text-zinc-400 hover:text-white"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore(b)}
                      className="text-zinc-400 hover:text-amber-400"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Schedule Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md border-zinc-700">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-white text-base">
                New Backup Schedule
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
                className="text-zinc-400"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Device Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    placeholder="Main Router"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>IP Address</Label>
                    <Input
                      value={form.ip_address}
                      onChange={(e) =>
                        setForm({ ...form, ip_address: e.target.value })
                      }
                      required
                      placeholder="192.168.88.1"
                    />
                  </div>
                  <div>
                    <Label>API Port</Label>
                    <Input
                      type="number"
                      value={form.api_port}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          api_port: parseInt(e.target.value) || 8728,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Username</Label>
                  <Input
                    value={form.username}
                    onChange={(e) =>
                      setForm({ ...form, username: e.target.value })
                    }
                    required
                    placeholder="admin"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Schedule</Label>
                    <select
                      value={form.schedule}
                      onChange={(e) =>
                        setForm({ ...form, schedule: e.target.value })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={form.time}
                      onChange={(e) =>
                        setForm({ ...form, time: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    Create Schedule
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Restore Modal */}
      {showRestore && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md border-zinc-700">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-white text-base">
                Restore Backup
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRestore(null)}
                className="text-zinc-400"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400 mb-4">
                Restore{" "}
                <span className="text-white">
                  {showRestore.device_name || showRestore.name}
                </span>{" "}
                to a target router
              </p>
              <form onSubmit={executeRestore} className="space-y-4">
                <div>
                  <Label>Target IP</Label>
                  <Input
                    value={restoreForm.target_ip}
                    onChange={(e) =>
                      setRestoreForm({
                        ...restoreForm,
                        target_ip: e.target.value,
                      })
                    }
                    required
                    placeholder="192.168.88.1"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Port</Label>
                    <Input
                      type="number"
                      value={restoreForm.target_port}
                      onChange={(e) =>
                        setRestoreForm({
                          ...restoreForm,
                          target_port: parseInt(e.target.value) || 8728,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Username</Label>
                    <Input
                      value={restoreForm.target_username}
                      onChange={(e) =>
                        setRestoreForm({
                          ...restoreForm,
                          target_username: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={restoreForm.target_password}
                    onChange={(e) =>
                      setRestoreForm({
                        ...restoreForm,
                        target_password: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowRestore(null)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={restoring}
                    className="flex-1 gap-1.5"
                  >
                    {restoring ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    {restoring ? "Restoring..." : "Restore"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md border-zinc-700">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-white text-base">
                Upload Backup File
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowUpload(false);
                  setUploadFile(null);
                }}
                className="text-zinc-400"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={executeUpload} className="space-y-4">
                <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center">
                  <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400 mb-2">
                    Select a .rsc backup file
                  </p>
                  <Input
                    type="file"
                    accept=".rsc,.backup"
                    onChange={handleFileUpload}
                    className="max-w-xs mx-auto"
                  />
                  {uploadFile && (
                    <p className="text-xs text-emerald-400 mt-2">
                      {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)}
                      KB)
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowUpload(false);
                      setUploadFile(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!uploadFile || uploading}
                    className="flex-1 gap-1.5"
                  >
                    {uploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View Backup Content Modal */}
      {viewBackup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] border-zinc-700">
            <CardHeader className="flex-row items-center justify-between pb-2 shrink-0">
              <CardTitle className="text-white text-base">
                Backup: {viewBackup.device_name || viewBackup.name}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewBackup(null)}
                className="text-zinc-400"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="overflow-auto">
              <pre className="text-xs text-emerald-400 bg-zinc-900 p-4 rounded-lg font-mono whitespace-pre-wrap max-h-[60vh] overflow-auto">
                {viewBackup.config_content ||
                  viewBackup.content ||
                  "# No content available"}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

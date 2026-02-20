import chalk from "chalk";
import ora, { type Ora } from "ora";

export function createSpinner(text: string): Ora {
  return ora({ text, spinner: "dots" });
}

export function success(msg: string): void {
  console.log(chalk.green("  " + msg));
}

export function error(msg: string): void {
  console.error(chalk.red("  " + msg));
}

export function warn(msg: string): void {
  console.log(chalk.yellow("  " + msg));
}

export function info(msg: string): void {
  console.log(chalk.cyan("  " + msg));
}

export function table(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] ?? "").length), 0);
    return Math.max(h.length, maxData) + 2;
  });

  const divider = colWidths.map((w) => "-".repeat(w)).join("+");
  const formatRow = (cells: string[]) =>
    cells.map((cell, i) => (cell ?? "").padEnd(colWidths[i])).join("|");

  console.log(chalk.bold(formatRow(headers)));
  console.log(divider);
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

export function formatAKT(amount: number): string {
  return `${amount.toFixed(4)} AKT`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function banner(): void {
  const art = chalk.cyan(`
  ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗  █████╗
  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔══██╗
  ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║███████║
  ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║██╔══██║
  ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║██║  ██║
  ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
  `);
  console.log(art);
  console.log(chalk.dim("  Your agent, unkillable.\n"));
}

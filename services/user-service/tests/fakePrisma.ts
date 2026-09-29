import type { PrismaClient } from "../generated/client/index.js";

interface FakeEmployee {
  id: string;
  organizationId: string;
  userId: string | null;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  teamId: string | null;
  managerId: string | null;
  employmentType: string;
  employmentStatus: string;
  hireDate: Date;
  location: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `employee_${idCounter}`;
}

function matchesSearch(employee: FakeEmployee, search: string): boolean {
  const needle = search.toLowerCase();
  return (
    employee.firstName.toLowerCase().includes(needle) ||
    employee.lastName.toLowerCase().includes(needle) ||
    employee.email.toLowerCase().includes(needle)
  );
}

export function createFakePrisma() {
  const employees = new Map<string, FakeEmployee>();

  function matchesWhere(employee: FakeEmployee, where: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (key === "OR") {
        const clauses = value as Array<Record<string, { contains: string }>>;
        const search =
          clauses[0]?.firstName?.contains ??
          clauses[0]?.lastName?.contains ??
          clauses[0]?.email?.contains;
        if (search && !matchesSearch(employee, search)) return false;
        continue;
      }
      if (value === undefined) continue;
      if ((employee as unknown as Record<string, unknown>)[key] !== value) return false;
    }
    return true;
  }

  const fake = {
    employee: {
      findMany: async ({
        where,
        skip = 0,
        take = 20,
        orderBy,
      }: {
        where: Record<string, unknown>;
        skip?: number;
        take?: number;
        orderBy?: { lastName: "asc" | "desc" };
      }) => {
        let list = [...employees.values()].filter((e) => matchesWhere(e, where));
        if (orderBy?.lastName) {
          list = list.sort((a, b) =>
            orderBy.lastName === "asc"
              ? a.lastName.localeCompare(b.lastName)
              : b.lastName.localeCompare(a.lastName),
          );
        }
        return list.slice(skip, skip + take);
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        [...employees.values()].filter((e) => matchesWhere(e, where)).length,
      findUnique: async ({
        where,
      }: {
        where: {
          organizationId_employeeNumber?: { organizationId: string; employeeNumber: string };
        };
      }) => {
        if (where.organizationId_employeeNumber) {
          const { organizationId, employeeNumber } = where.organizationId_employeeNumber;
          return (
            [...employees.values()].find(
              (e) => e.organizationId === organizationId && e.employeeNumber === employeeNumber,
            ) ?? null
          );
        }
        return null;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        [...employees.values()].find(
          (e) => e.id === where.id && e.organizationId === where.organizationId,
        ) ?? null,
      create: async ({
        data,
      }: {
        data: Pick<
          FakeEmployee,
          | "organizationId"
          | "employeeNumber"
          | "firstName"
          | "lastName"
          | "email"
          | "hireDate"
          | "employmentType"
        > &
          Partial<FakeEmployee>;
      }) => {
        const employee: FakeEmployee = {
          id: nextId(),
          userId: null,
          phone: null,
          jobTitle: null,
          departmentId: null,
          teamId: null,
          managerId: null,
          location: null,
          avatarUrl: null,
          employmentStatus: "ACTIVE",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        employees.set(employee.id, employee);
        return employee;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeEmployee> }) => {
        const employee = employees.get(where.id);
        if (!employee) throw new Error("employee not found");
        Object.assign(employee, data, { updatedAt: new Date() });
        return employee;
      },
    },
  };

  return fake as unknown as PrismaClient;
}

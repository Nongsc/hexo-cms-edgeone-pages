/** 文章 / 页面接口。 */

import { get, post, put, del } from "@/utils/http";
import type { Document, DocumentKind, DocumentSummary, DocumentStatus, ListQuery, Paginated } from "./types";

export interface DocumentListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: DocumentStatus | "all";
  tag?: string;
  category?: string;
  sortBy?: "updatedAt" | "publishedAt" | "title";
  sortOrder?: "asc" | "desc";
}

export interface DocumentPayload {
  title: string;
  content: string;
  status?: DocumentStatus;
  slug?: string;
  tags?: string[];
  categories?: string[];
  cover?: string;
  sticky?: boolean;
  summary?: string;
  frontMatter?: Record<string, unknown>;
  sourcePath?: string;
}

export function listDocuments(kind: DocumentKind, params: DocumentListParams = {}): Promise<Paginated<DocumentSummary>> {
  return get<Paginated<DocumentSummary>>(`/documents/${kind}`, params);
}

export function getDocument(id: number): Promise<Document> {
  return get<Document>(`/documents/detail/${id}`);
}

export function createDocument(kind: DocumentKind, payload: DocumentPayload): Promise<Document> {
  return post<Document>(`/documents/${kind}`, payload);
}

export function updateDocument(id: number, payload: Partial<DocumentPayload>): Promise<Document> {
  return put<Document>(`/documents/detail/${id}`, payload);
}

export function setDocumentStatus(id: number, status: DocumentStatus): Promise<Document> {
  return post<Document>(`/documents/detail/${id}/status`, { status });
}

export function trashDocument(id: number): Promise<null> {
  return del<null>(`/documents/detail/${id}`);
}

export function listTrashed(kind?: DocumentKind): Promise<Paginated<DocumentSummary>> {
  return get<Paginated<DocumentSummary>>("/recycle", { kind });
}

export function restoreDocument(id: number): Promise<null> {
  return post<null>(`/recycle/${id}/restore`);
}

export function destroyDocument(id: number): Promise<null> {
  return del<null>(`/recycle/${id}`);
}

export function getTaxonomy(): Promise<{ tags: string[]; categories: string[] }> {
  return get<{ tags: string[]; categories: string[] }>("/documents/post/taxonomy");
}

export function syncFromGitHub(): Promise<{ imported: number; updated: number; downgraded: number }> {
  return post<{ imported: number; updated: number; downgraded: number }>("/documents/post/sync");
}

export type { Document, DocumentKind, DocumentStatus, DocumentSummary, ListQuery, Paginated };

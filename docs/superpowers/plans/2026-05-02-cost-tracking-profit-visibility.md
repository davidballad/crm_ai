# Cost Tracking & Profit Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture product cost snapshots in transactions and provide customers with profit analytics via a dedicated Profits & Analytics page showing summary, by-product, and by-supplier breakdowns.

**Architecture:** Backend captures unit_cost at transaction creation time, stores cost_total in Transaction. New /profits Lambda provides read-only endpoints aggregating transaction data by period. Frontend Profits page fetches these endpoints and displays metrics grid, trend data, and breakdown tables.

**Tech Stack:** Python 3.12 (backend), React 18 (frontend), DynamoDB (queries), TDD approach

---

## Phase 1: MVP (Overview Tab Only)

### Task 1: Update TransactionItem Model
### Task 2: Update Transaction Creation to Capture Cost
### Task 3: Add Calculated Fields to Transaction Response
### Task 4: Create Profits Lambda Function
### Task 5: Wire Up Profits Lambda in Terraform
### Task 6: Create Profits API Client
### Task 7: Create useProfits Hook
### Task 8: Create ProfitsOverview Component
### Task 9: Create Profits Page
### Task 10: Run Full Test Suite

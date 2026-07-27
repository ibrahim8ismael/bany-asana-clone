"use client"

import { useState, useTransition } from "react"
import { ShieldCheck } from "lucide-react"
import { updateProjectQualitySettings } from "@/actions/quality-actions"
import { Button } from "@/components/ui/button"

interface ReviewerOption {
  id: string
  full_name: string
  email: string
}

const policyDescriptions = {
  off: "Tasks can be completed directly. No quality queue is created.",
  optional: "Assignees can send a task for review or complete it directly.",
  required: "Done is replaced by Submit for review. Approval is required to complete the task.",
}

export default function ProjectQualityPolicySettings({
  projectId,
  initialPolicy,
  initialDefaultReviewerId,
  initialReviewSlaDays,
  reviewers,
  canManage,
  onSaved,
}: {
  projectId: string
  initialPolicy: "off" | "optional" | "required"
  initialDefaultReviewerId: string | null
  initialReviewSlaDays: number
  reviewers: ReviewerOption[]
  canManage: boolean
  onSaved?: (settings: { policy: "off" | "optional" | "required"; defaultReviewerId: string | null; reviewSlaDays: number }) => void
}) {
  const [policy, setPolicy] = useState(initialPolicy)
  const [defaultReviewerId, setDefaultReviewerId] = useState(initialDefaultReviewerId || "")
  const [reviewSlaDays, setReviewSlaDays] = useState(initialReviewSlaDays)
  const [message, setMessage] = useState("")
  const [pending, startTransition] = useTransition()

  const save = () => {
    setMessage("")
    startTransition(async () => {
      const result = await updateProjectQualitySettings(projectId, {
        policy,
        defaultReviewerId: defaultReviewerId || null,
        reviewSlaDays,
      })
      setMessage(result.success ? "Quality policy saved." : result.error || "Could not save quality policy")
      if (result.success) onSaved?.({ policy, defaultReviewerId: defaultReviewerId || null, reviewSlaDays })
    })
  }

  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-white/85">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-white/30">Quality policy</h3>
        </div>
        <p className="mt-2 text-xs leading-5 text-white/35">Controls how project tasks enter the Reviews queue.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-white/7 bg-[#262729] p-4">
        <label className="block text-xs font-semibold text-white/55">
          Review requirement
          <select
            value={policy}
            disabled={!canManage || pending}
            onChange={(event) => setPolicy(event.target.value as "off" | "optional" | "required")}
            className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#1f2022] px-3 text-sm font-normal text-white/80 outline-none disabled:opacity-60"
          >
            <option value="off">Off</option>
            <option value="optional">Optional</option>
            <option value="required">Required</option>
          </select>
        </label>
        <p className="text-xs leading-5 text-white/38">{policyDescriptions[policy]}</p>

        {policy !== "off" ? (
          <>
            <label className="block text-xs font-semibold text-white/55">
              Fallback reviewer
              <select
                value={defaultReviewerId}
                disabled={!canManage || pending}
                onChange={(event) => setDefaultReviewerId(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#1f2022] px-3 text-sm font-normal text-white/80 outline-none disabled:opacity-60"
              >
                <option value="">No fallback reviewer</option>
                {reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.full_name}</option>)}
              </select>
            </label>
            <p className="text-[11px] leading-5 text-white/30">The task creator reviews by default. This person is used when the creator is also the assignee.</p>

            <label className="block text-xs font-semibold text-white/55">
              Review SLA · business days
              <input
                type="number"
                min={1}
                max={30}
                value={reviewSlaDays}
                disabled={!canManage || pending}
                onChange={(event) => setReviewSlaDays(Number(event.target.value))}
                className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#1f2022] px-3 text-sm font-normal text-white/80 outline-none disabled:opacity-60"
              />
            </label>
          </>
        ) : null}

        {message ? <div className={`rounded-lg px-3 py-2 text-xs ${message.includes("saved") ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"}`}>{message}</div> : null}
        {canManage ? <Button type="button" size="sm" disabled={pending} onClick={save} className="w-full">{pending ? "Saving..." : "Save quality policy"}</Button> : <div className="text-xs text-white/30">Only project owners and admins can change this policy.</div>}
      </div>
    </section>
  )
}

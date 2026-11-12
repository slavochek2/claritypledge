/**
 * @file use-cases-entry.tsx
 * @description The signed-in shell's "Use cases" entry (founder 2026-11-12): it replaces the single
 * "ClarityPledge website" row, which opened /builders without saying so. Desktop avatar menu: a submenu.
 * Phone Me sheet: a row that expands in place. Both list AUDIENCE_LINKS, the same list as the public nav.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDownIcon, CompassIcon } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { AUDIENCE_LINKS } from './nav-links';

export function UseCasesDropdownEntry({ onItemClick }: { onItemClick: () => void }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer">
        <CompassIcon className="w-4 h-4 mr-2" />
        Use cases
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {AUDIENCE_LINKS.map((l) => (
          <DropdownMenuItem asChild key={l.to}>
            <Link to={l.to} className="cursor-pointer" onClick={onItemClick}>
              <l.Icon className="w-4 h-4 mr-2" />
              {l.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function UseCasesMobileEntry({ linkClass, iconClass, onItemClick }: { linkClass: string; iconClass: string; onItemClick: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${linkClass} w-full text-left`}>
        <CompassIcon className={iconClass} />
        Use cases
        <ChevronDownIcon aria-hidden className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col pl-6" data-testid="use-cases-list">
          {AUDIENCE_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={linkClass} onClick={onItemClick}>
              <l.Icon className={iconClass} />
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

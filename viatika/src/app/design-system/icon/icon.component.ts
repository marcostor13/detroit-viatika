import { Component, Type, computed, input } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import {
  LucideArrowLeft as ArrowLeft,
  LucideArrowRight as ArrowRight,
  LucideBell as Bell,
  LucideBriefcase as Briefcase,
  LucideBuilding2 as Building2,
  LucideCalendar as Calendar,
  LucideCar as Car,
  LucideCheck as Check,
  LucideCircleAlert as CircleAlert,
  LucideCircleCheck as CircleCheck,
  LucideCircleX as CircleX,
  LucideClipboardList as ClipboardList,
  LucideClock as Clock,
  LucideCreditCard as CreditCard,
  LucideDownload as Download,
  LucideEllipsis as Ellipsis,
  LucideEllipsisVertical as EllipsisVertical,
  LucideEye as Eye,
  LucideEyeOff as EyeOff,
  LucideFileText as FileText,
  LucideInfo as Info,
  LucideLandmark as Landmark,
  LucideListFilter as ListFilter,
  LucideLoader as Loader,
  LucideLogOut as LogOut,
  LucideMapPin as MapPin,
  LucideMenu as Menu,
  LucidePaperclip as Paperclip,
  LucidePencil as Pencil,
  LucidePlus as Plus,
  LucideReceipt as Receipt,
  LucideRefreshCw as RefreshCw,
  LucideSearch as Search,
  LucideSend as Send,
  LucideSettings as Settings,
  LucideShieldCheck as ShieldCheck,
  LucideTag as Tag,
  LucideTriangleAlert as TriangleAlert,
  LucideTrash2 as Trash2,
  LucideUpload as Upload,
  LucideUser as User,
  LucideUsers as Users,
  LucideWallet as Wallet,
  LucideX as X,
  LucideChevronDown as ChevronDown,
  LucideChevronLeft as ChevronLeft,
  LucideChevronRight as ChevronRight,
  LucideChevronUp as ChevronUp,
  LucideDollarSign as DollarSign,
  LucideHome as Home,
} from '@lucide/angular';

// Icon names supported by app-icon. Extend this map as new icons are
// adopted — never paste raw SVGs into templates again (see Fase 4 del
// plan de UI kit: barrido de íconos).
const ICONS: Record<string, Type<unknown>> = {
  home: Home,
  menu: Menu,
  close: X,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  check: Check,
  'circle-check': CircleCheck,
  'circle-x': CircleX,
  'circle-alert': CircleAlert,
  'triangle-alert': TriangleAlert,
  info: Info,
  plus: Plus,
  trash: Trash2,
  edit: Pencil,
  search: Search,
  download: Download,
  upload: Upload,
  eye: Eye,
  'eye-off': EyeOff,
  bell: Bell,
  user: User,
  users: Users,
  settings: Settings,
  'log-out': LogOut,
  'file-text': FileText,
  paperclip: Paperclip,
  calendar: Calendar,
  clock: Clock,
  'dollar-sign': DollarSign,
  'credit-card': CreditCard,
  wallet: Wallet,
  receipt: Receipt,
  'clipboard-list': ClipboardList,
  building: Building2,
  filter: ListFilter,
  'more-vertical': EllipsisVertical,
  'more-horizontal': Ellipsis,
  refresh: RefreshCw,
  loader: Loader,
  landmark: Landmark,
  tag: Tag,
  briefcase: Briefcase,
  'shield-check': ShieldCheck,
  send: Send,
  'map-pin': MapPin,
  car: Car,
};

export type IconName = keyof typeof ICONS;
export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<IconSize, number> = { sm: 18, md: 22, lg: 28, xl: 48 };

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [NgComponentOutlet],
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
})
export class IconComponent {
  name = input.required<IconName>();
  size = input<IconSize>('md');
  strokeWidth = input<number>(2);
  /** Accessible label for functional icons (rare — most icons are decorative and stay aria-hidden). */
  label = input<string>('');

  iconType = computed<Type<unknown>>(() => ICONS[this.name()]);

  iconInputs = computed(() => ({
    size: SIZE_PX[this.size()],
    strokeWidth: this.strokeWidth(),
    title: this.label() || undefined,
  }));
}

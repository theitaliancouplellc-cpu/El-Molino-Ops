import './mobile-polish.css';
import EmployeeConnectionState from './connection-state';
import StaffBottomNav from './staff-bottom-nav';
import StaffReleaseBoundary from './staff-release-boundary';
import StaffTour from './staff-tour';

export default function EmployeeLayout({children}:{children:React.ReactNode}){
 return <div className="employee-shell"><EmployeeConnectionState/><StaffReleaseBoundary><>{children}<StaffTour/></></StaffReleaseBoundary><StaffBottomNav/></div>;
}

import './mobile-polish.css';
import EmployeeConnectionState from './connection-state';
import StaffReleaseBoundary from './staff-release-boundary';

export default function EmployeeLayout({children}:{children:React.ReactNode}){
 return <div className="employee-shell"><EmployeeConnectionState/><StaffReleaseBoundary>{children}</StaffReleaseBoundary></div>;
}

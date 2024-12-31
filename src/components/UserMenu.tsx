// components/UserMenu.tsx
import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { IconUserCircle, IconLogout, IconUser } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';

export default function UserMenu() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <Menu as="div" className="relative">
      <Menu.Button className="w-full px-3 py-2.5 flex items-center rounded-lg hover:bg-default-200 active:bg-default-300 border border-default-300 transition-colors duration-200">
        <div className="flex w-full justify-between">
          <div className="flex items-center">
            <IconUserCircle className="flex-shrink-0 mr-3 text-default-700" stroke={1.5} />
            <span className="text-sm font-medium text-default-700">
              {user?.name || 'Not logged in'}
            </span>
          </div>
        </div>
      </Menu.Button>
      
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 bottom-16 mt-2 w-56 origin-bottom-right rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="px-1 py-1">
            <Menu.Item>
              {({ active }) => (
                <button
                  className={`${
                    active ? 'bg-default-100' : ''
                  } group flex w-full items-center rounded-md px-2 py-2 text-sm text-default-700`}
                >
                  <IconUser
                    className="mr-2 h-5 w-5"
                    aria-hidden="true"
                    stroke={1.5}
                  />
                  {user?.ic_no}
                </button>
              )}
            </Menu.Item>
            <Menu.Item>
              {({ active }) => (
                <button
                  className={`${
                    active ? 'bg-default-100' : ''
                  } group flex w-full items-center rounded-md px-2 py-2 text-sm text-default-700`}
                  onClick={handleLogout}
                >
                  <IconLogout
                    className="mr-2 h-5 w-5"
                    aria-hidden="true"
                    stroke={1.5}
                  />
                  Logout
                </button>
              )}
            </Menu.Item>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
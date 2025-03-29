
import Button from '../Button';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  itemsCount: number;
  onPageChange: (page: number) => void;
}

const PaginationControls = ({ currentPage, totalPages, itemsCount, onPageChange }: PaginationControlsProps) => {
  const getVisiblePages = () => {
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    const showAllPages = totalPages <= 7;

    if (showAllPages) return pages;

    if (currentPage <= 4) {
      return [...pages.slice(0, 5), '...', totalPages];
    }
    
    if (currentPage >= totalPages - 3) {
      return [1, '...', ...pages.slice(-5)];
    }

    return [
      1,
      '...',
      currentPage - 1,
      currentPage,
      currentPage + 1,
      '...',
      totalPages
    ];
  };

  if (itemsCount === 0) {
    return (
      <div className="flex items-center justify-between border-t border-default-200 bg-white px-4 py-3">
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" disabled>Previous</Button>
          <Button variant="outline" size="sm" disabled>Next</Button>
        </div>
        <div className="text-sm text-default-600">No items to display</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-t border-default-200 bg-white px-4 py-3">
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </Button>

        {getVisiblePages().map((page, idx) => 
          page === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page as number)}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                page === currentPage
                  ? 'bg-default-100 text-default-700'
                  : 'text-default-600 hover:bg-default-50'
              }`}
            >
              {page}
            </button>
          )
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </Button>
      </div>
      <div className="text-sm text-default-600">
        {totalPages > 0 
          ? `Showing page ${currentPage} of ${totalPages}`
          : 'No pages available'
        }
      </div>
    </div>
  );
};

export default PaginationControls;